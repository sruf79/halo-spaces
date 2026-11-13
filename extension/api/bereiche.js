/* halo.spaces – Bereiche und Hinweise (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js direkt nach mail.js in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): Thanks („Danke sagen“), Weather
 * (Wetter in der Today-Pane, Karten-Links), SpacesOrder (Reihenfolge der
 * Bereiche), FifthSpace (fünfter Bereich) und UpdateNote (Hinweis auf ein
 * Update) samt ihren Konstanten stehen danach dort direkt zur Verfügung. Zur
 * Ladezeit nur Namen nutzen, die vorher schon da sind; Namen aus
 * implementation.js (tr, log, extensionVersion …) erst zur Laufzeit.
 * Reihe „Code: implementation.js in Module zerlegen“ 3/8.
 */

"use strict";

// „Danke sagen“ mit leiser Erinnerung (Vorbild: derStandard Comment Ranker):
// kein Fenster, keine Mitteilung, kein Server – nur lokale Prefs. Gezählt werden
// Nutzungstage (Tage, an denen Thunderbird mit halo.spaces lief), nicht
// Kalendertage: Wer Thunderbird eine Woche nicht öffnet, wird nicht früher
// erinnert. Ist eine Erinnerung fällig, bekommt das Symbol von Hilfe →
// halo.spaces einen Punkt in der Spendenfarbe und „Danke sagen“ im
// Info-Fenster und in den Einstellungen einen Ring. Ein Klick auf „Danke
// sagen“ gilt als erledigt (höchstens einmal am Tag), ebenso eine Erinnerung,
// die THANKS_SHOW_DAYS Nutzungstage unbeachtet blieb – sie leuchtet also nie
// dauerhaft. Ob jemand wirklich spendet, wissen wir nicht (gewollt).
const THANKS_BRANCH = "extensions.mailcards.thanks.";
const THANKS_DAYS_PREF = THANKS_BRANCH + "usageDays";
const THANKS_LAST_DAY_PREF = THANKS_BRANCH + "lastDay";
const THANKS_COUNT_PREF = THANKS_BRANCH + "count";
const THANKS_ACK_DAY_PREF = THANKS_BRANCH + "ackDay";
// Tag des letzten Update-Hinweises: eine Bitte zur Zeit – an diesem Tag (und
// solange das Update bereitliegt) keine Danke-Erinnerung
const THANKS_UPDATE_DAY_PREF = THANKS_BRANCH + "updateDay";
const THANKS_SHOW_DAYS = 7;
const Thanks = {
  listeners: new Set(),
  // Nutzungstag der Erinnerung nach n erledigten: erste am 14. Tag (zwei
  // Wochen im Alltag, man kennt halo.spaces dann), danach Abstände von 21
  // Tagen, die jeweils um die Hälfte wachsen, höchstens ein Jahr:
  // 14, 35, 67, 114, 185, 291, 451, 690, 1049, 1414, … – nach dem ersten Jahr
  // also etwa zweimal im Jahr, später einmal
  dueDay(n) {
    let day = 14, gap = 21;
    for (let i = 0; i < n; i++) {
      day += gap;
      gap = Math.min(gap * 1.5, 365);
    }
    return Math.ceil(day);
  },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  days() {
    return Services.prefs.getIntPref(THANKS_DAYS_PREF, 0);
  },
  count() {
    return Services.prefs.getIntPref(THANKS_COUNT_PREF, 0);
  },
  due() {
    if (UpdateNote.pending || Services.prefs.getStringPref(THANKS_UPDATE_DAY_PREF, "") == this.today()) {
      return false;
    }
    const days = this.days(), from = this.dueDay(this.count());
    return days >= from && days < from + THANKS_SHOW_DAYS;
  },
  // beim Start und stündlich: heutigen Tag zählen (Thunderbird läuft oft
  // tagelang durch), unbeachtete Erinnerungen nach THANKS_SHOW_DAYS beenden
  countDay() {
    const today = this.today();
    if (Services.prefs.getStringPref(THANKS_LAST_DAY_PREF, "") == today) {
      return;
    }
    const days = this.days() + 1;
    let n = this.count();
    while (days >= this.dueDay(n) + THANKS_SHOW_DAYS) {
      n++;
    }
    Services.prefs.setStringPref(THANKS_LAST_DAY_PREF, today);
    if (n != this.count()) {
      Services.prefs.setIntPref(THANKS_COUNT_PREF, n);
    }
    Services.prefs.setIntPref(THANKS_DAYS_PREF, days);
    log("thanks: Nutzungstag", days, "fällig ab", this.dueDay(n), this.due() ? "→ Erinnerung" : "");
  },
  // Klick auf „Danke sagen“: nächste Erinnerung erst am nächsten berechneten Tag
  ack() {
    const today = this.today();
    if (Services.prefs.getStringPref(THANKS_ACK_DAY_PREF, "") == today) {
      return;
    }
    Services.prefs.setStringPref(THANKS_ACK_DAY_PREF, today);
    Services.prefs.setIntPref(THANKS_COUNT_PREF, this.count() + 1);
  },
  // Spendenseite im Standardbrowser öffnen (loadURI braucht seit Thunderbird
  // 140 einen Principal und tat ohne ihn nichts)
  open(w) {
    this.ack();
    const main = Services.wm.getMostRecentWindow("mail:3pane") || w;
    if (typeof main?.openLinkExternally == "function") {
      main.openLinkExternally(DONATE_URL);
    } else {
      Cc["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Ci.nsIExternalProtocolService)
        .loadURI(Services.io.newURI(DONATE_URL), Services.scriptSecurityManager.getSystemPrincipal());
    }
  },
  // Symbol mit Punkt für Hilfe → halo.spaces (macOS-Menüleiste kann nur ein
  // Bild zeigen, kein CSS): icon.svg mit Kreis oben rechts, als data:-Adresse
  dotIcon: null,
  async iconWithDot(w) {
    if (!this.dotIcon) {
      const svg = await (await w.fetch("resource://mailcards/about/icon.svg")).text();
      const dot = '<circle cx="53" cy="11" r="10.5" fill="#FF8A00" stroke="#FFFFFF" stroke-width="3"/>';
      this.dotIcon = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/<\/svg>\s*$/, dot + "</svg>"));
    }
    return this.dotIcon;
  },
};

// ---------- Wetter in der Today-Pane (Option, Standard aus) ----------
// Das Symbol neben dem Titel zeigt das aktuelle Wetter statt der festen Sonne.
// Quelle: Open-Meteo (ohne Schlüssel, CC BY 4.0), höchstens alle 30 Minuten,
// der letzte Wert bleibt gespeichert; ohne Netz bleibt die Sonne. Ort: eine
// Stadt (einmal über die Geocoding-API von Open-Meteo in Koordinaten
// übersetzt) oder – ohne Stadt – der aktuelle Standort des Systems (macOS
// fragt einmal nach den Ortungsdiensten). Koordinaten auf 2 Nachkommastellen
// (etwa 1 km) gerundet, bevor sie das Gerät verlassen.
const WEATHER_PREF = "extensions.mailcards.weather";
const WEATHER_PLACE_PREF = "extensions.mailcards.weatherPlace";
const WEATHER_STATE_PREF = "extensions.mailcards.weatherState"; // JSON: Ort, Koordinaten, letzter Wert, Status
const WEATHER_EVERY = 30 * 60 * 1000;
// Systemeinstellung der Ortung (macOS, Windows; Linux: kein einheitlicher Ort)
const LOCATION_SETTINGS_URL = Services.appinfo.OS == "Darwin" ? "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices"
  : Services.appinfo.OS == "WINNT" ? "ms-settings:privacy-location" : null;
function openLocationSettings() {
  if (LOCATION_SETTINGS_URL) {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(LOCATION_SETTINGS_URL), Services.scriptSecurityManager.getSystemPrincipal());
  }
}
// Ort eines Termins in der Karten-App des Systems (wie Apple Kalender → Karten):
// macOS Karten (maps:), Windows Karten (bingmaps:), sonst geo: (Linux: der
// eingestellte Handler, z. B. GNOME Maps). Kein Webdienst, keine Verbindung
// der Erweiterung; ohne passende App bleibt der Ort Text.
function mapsUrl(address, os) {
  const q = encodeURIComponent(String(address ?? "").replace(/\s+/g, " ").trim());
  if (!q) {
    return null;
  }
  if (os == "Darwin") {
    return `maps://?q=${q}`;
  }
  if (os == "WINNT") {
    return `bingmaps:?q=${q}`;
  }
  return `geo:0,0?q=${q}`;
}
function mapsAppExists(url) {
  try {
    return Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
      .externalProtocolHandlerExists(url.slice(0, url.indexOf(":")));
  } catch {
    return false;
  }
}
// Direkt mit der Standard-App des Systems wie Apple Kalender – ohne Thunderbirds
// Rückfrage „Open in …“ (über loadURI fragt Thunderbird bei maps:/bingmaps:/geo:
// jedes Mal, solange „immer fragen“ gilt). Thunderbirds gespeicherte Wahl für
// das Schema bleibt unverändert (nur diese Kopie der Angaben, kein store()).
// svc, uri: Protokolldienst und Adresse (Logik-Tests setzen eigene)
function openMaps(url, svc = null, uri = null) {
  svc ??= Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
  uri ??= Services.io.newURI(url);
  const handler = svc.getProtocolHandlerInfo(url.slice(0, url.indexOf(":")));
  handler.preferredAction = Ci.nsIHandlerInfo.useSystemDefault;
  handler.alwaysAskBeforeHandling = false;
  handler.launchWithURI(uri, null);
}
// Wetter in Worten (Tooltip des Wettersymbols)
const WEATHER_WORDS = {
  "clear-day": "Sunny", "clear-night": "Clear", "partly-day": "Partly Cloudy", "partly-night": "Partly Cloudy",
  cloudy: "Cloudy", fog: "Fog", rain: "Rain", snow: "Snow", thunder: "Thunderstorm",
};

const Weather = {
  titles: new Set(),
  timer: null,
  observer: null,
  state() {
    try {
      return JSON.parse(Services.prefs.getStringPref(WEATHER_STATE_PREF, "{}")) || {};
    } catch {
      return {};
    }
  },
  save(state) {
    Services.prefs.setStringPref(WEATHER_STATE_PREF, JSON.stringify(state));
  },
  enabled() {
    return Services.prefs.getBoolPref(WEATHER_PREF, false);
  },
  // WMO-Wettercode → Symbol
  kind(code, isDay) {
    if (code <= 1) return isDay ? "clear-day" : "clear-night";
    if (code == 2) return isDay ? "partly-day" : "partly-night";
    if (code == 3) return "cloudy";
    if (code == 45 || code == 48) return "fog";
    if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "snow";
    if (code >= 95) return "thunder";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    return isDay ? "clear-day" : "clear-night";
  },
  attach(win, title) {
    this.titles.add(title);
    win.addEventListener("unload", () => this.titles.delete(title), { once: true });
    if (!this.observer) {
      this.observer = { observe: () => this.refresh(true) };
      Services.prefs.addObserver(WEATHER_PREF, this.observer);
      Services.prefs.addObserver(WEATHER_PLACE_PREF, this.observer);
      this.timer = Services.wm.getMostRecentWindow("mail:3pane")?.setInterval(() => this.refresh(), 5 * 60 * 1000);
      enhancer?.restorers.push(() => this.stop());
    }
    this.show();
    this.refresh();
  },
  stop() {
    if (this.observer) {
      Services.prefs.removeObserver(WEATHER_PREF, this.observer);
      Services.prefs.removeObserver(WEATHER_PLACE_PREF, this.observer);
      this.observer = null;
    }
    for (const w of Services.wm.getEnumerator("mail:3pane")) {
      w.clearInterval(this.timer);
    }
    for (const t of this.titles) {
      t.removeAttribute("data-weather");
      t.removeAttribute("data-weather-off");
      t.querySelector("#mcTodayWeather")?.removeAttribute("title");
    }
    this.titles.clear();
  },
  // gespeicherten Wert an alle Titel
  show() {
    const st = this.state();
    const on = this.enabled() && st.kind;
    // Titeltext: „Go to Today“ (am Titel); Symbol daneben: nur das Wetter –
    // eingeschaltet, aber noch ohne Daten die feste Sonne (erbt den Tooltip
    // des Titels), ausgeschaltet gar kein Symbol (data-weather-off)
    for (const t of this.titles) {
      t.toggleAttribute("data-weather-off", !this.enabled());
      const icon = t.querySelector("#mcTodayWeather");
      if (on) {
        t.dataset.weather = st.kind;
        // derselbe Text wie unter „Place“ in den Einstellungen
        icon?.setAttribute("title", this.status().text);
      } else {
        t.removeAttribute("data-weather");
        // eingeschaltet, aber ohne Daten: eigener Hinweis (erbte sonst „Go to Today“)
        if (this.enabled()) {
          icon?.setAttribute("title", this.status().text || tr("Locating…"));
        } else {
          icon?.removeAttribute("title");
        }
      }
    }
  },
  // Zustand in Worten – Zeile unter „Place“, Begrüßung und Tooltip des Symbols:
  // tone „ok“ (grüner Punkt), „warn“ (oranger Punkt) oder leer (noch nichts);
  // link: Systemeinstellung der Ortung öffnen
  status() {
    const st = this.state();
    if (!this.enabled()) {
      return { tone: "", text: "" };
    }
    if (st.status == "ok" && st.kind) {
      const temp = st.temp != null ? `${Math.round(st.temp)} °C, ` : "";
      return { tone: "ok", text: `${st.place || tr("Current Location")} · ${temp}${tr(WEATHER_WORDS[st.kind] || "Clear")}` };
    }
    if (st.status == "denied") {
      return { tone: "warn", text: tr("Location access is off."), link: !!LOCATION_SETTINGS_URL };
    }
    if (st.status == "unavailable") {
      return { tone: "warn", text: tr("Location unavailable. Choose a city."), link: !!LOCATION_SETTINGS_URL };
    }
    if (st.status == "notfound") {
      return { tone: "warn", text: tr("City not found") };
    }
    return { tone: "", text: tr("Locating…") };
  },
  // zuletzt gewählte Orte (Auswahlmenü unter „Place“), neueste zuerst
  recent() {
    const list = this.state().recent;
    return Array.isArray(list) ? list.filter(p => p?.label && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 5) : [];
  },
  // Standort des Systems über Thunderbirds Standortdienst (CoreLocation,
  // Windows-Standort, GeoClue) – navigator.geolocation im Fenster wartete auf
  // eine Freigabe-Abfrage, die Thunderbird nie zeigt, und kam nie zurück.
  // Unter macOS holt sich Thunderbird selbst keine Freigabe für die Ortung
  // (auch ein Skript über osascript bekommt keine – macOS fragt dafür nicht):
  // dann „nicht verfügbar“, und „Choose City…“ führt zur Stadtwahl.
  // Eigene Zeitgrenze zusätzlich
  locate(win) {
    return this.locateGecko(win);
  },
  locateGecko(win) {
    return new Promise(resolve => {
      let geo = null;
      try {
        geo = Cc["@mozilla.org/geolocation;1"].getService(Ci.nsISupports);
      } catch {}
      geo = geo?.getCurrentPosition ? geo : win?.navigator?.geolocation;
      if (!geo) {
        resolve({ error: "unavailable" });
        return;
      }
      const timer = setTimeout(() => resolve({ error: "unavailable" }), 20000);
      try {
        geo.getCurrentPosition(
          pos => {
            clearTimeout(timer);
            resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          },
          err => {
            clearTimeout(timer);
            resolve({ error: err?.code == 1 ? "denied" : "unavailable" });
          },
          { timeout: 15000, maximumAge: 60 * 60 * 1000 });
      } catch {
        clearTimeout(timer);
        resolve({ error: "unavailable" });
      }
    });
  },
  // Vorschläge beim Tippen: bis zu fünf Orte („Wien, Österreich“; bei gleichen
  // Namen mit Bundesland), nur der eingetippte Text geht an Open-Meteo
  async search(win, text) {
    const name = String(text || "").trim().slice(0, 80);
    if (name.length < 2 || !win) {
      return [];
    }
    const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&format=json&language=${encodeURIComponent(lang)}&name=${encodeURIComponent(name)}`;
    try {
      const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
      const hits = JSON.parse(await res.text())?.results || [];
      const seen = new Set();
      return hits.map(h => {
        let label = [h.name, h.country].filter(Boolean).join(", ");
        if (seen.has(label) && h.admin1) {
          label = [h.name, h.admin1, h.country].filter(Boolean).join(", ");
        }
        seen.add(label);
        return { label, lat: h.latitude, lon: h.longitude };
      }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return [];
    }
  },
  // gewählter Vorschlag: Koordinaten gleich merken (keine zweite Suche nach dem Namen)
  async choose(place) {
    const label = String(place?.label || "").slice(0, 120);
    const lat = Math.round(Number(place?.lat) * 100) / 100, lon = Math.round(Number(place?.lon) * 100) / 100;
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("not a place");
    }
    const recent = [{ label, lat, lon }, ...this.recent().filter(p => p.label != label)].slice(0, 5);
    this.save({ ...this.state(), for: label, lat, lon, place: label, time: 0, recent });
    Services.prefs.setStringPref(WEATHER_PLACE_PREF, label);
    await this.refresh(true);
  },
  async geocode(win, name) {
    const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=${encodeURIComponent(lang)}&name=${encodeURIComponent(name)}`;
    const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
    const hit = JSON.parse(await res.text())?.results?.[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude, place: [hit.name, hit.country].filter(Boolean).join(", ") } : null;
  },
  // jede Abfrage läuft für sich; gespeichert wird nur das Ergebnis der neuesten
  // (eine langsame Standortabfrage überschreibt keinen inzwischen gewählten Ort)
  gen: 0,
  async refresh(force = false) {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!this.enabled() || !win) {
      this.show();
      return;
    }
    const st = this.state();
    const wanted = Services.prefs.getStringPref(WEATHER_PLACE_PREF, "").trim();
    if (!force && st.time && Date.now() - st.time < WEATHER_EVERY && st.for == wanted) {
      this.show();
      return;
    }
    const gen = ++this.gen;
    const latest = () => gen == this.gen;
    try {
      let where = null;
      if (wanted) {
        where = st.for == wanted && st.lat != null ? { lat: st.lat, lon: st.lon, place: st.place } : await this.geocode(win, wanted);
        if (!where) {
          if (latest()) this.save({ ...st, for: wanted, status: "notfound", time: Date.now(), kind: null });
          this.show();
          return;
        }
      } else {
        // Standort höchstens alle 3 Stunden neu bestimmen, das Wetter dazu
        // weiter alle 30 Minuten
        const fresh = !force && !st.for && st.lat != null && st.locTime && Date.now() - st.locTime < 3 * 3600 * 1000;
        where = fresh ? { lat: st.lat, lon: st.lon, locTime: st.locTime } : await this.locate(win);
        where.locTime ||= Date.now();
        if (where.error) {
          if (latest()) this.save({ ...st, for: wanted, status: where.error, time: Date.now(), kind: null, place: null });
          this.show();
          return;
        }
        where.place = null;
      }
      const lat = Math.round(where.lat * 100) / 100, lon = Math.round(where.lon * 100) / 100;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day,temperature_2m&timezone=auto`;
      const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
      const cur = JSON.parse(await res.text())?.current;
      if (!res.ok || !cur) {
        throw new Error(`weather ${res.status}`);
      }
      if (!latest()) {
        return;
      }
      this.save({ for: wanted, lat, lon, place: where.place, status: "ok", time: Date.now(), recent: this.recent(),
                  locTime: wanted ? undefined : where.locTime,
                  kind: this.kind(cur.weather_code, cur.is_day), temp: cur.temperature_2m, code: cur.weather_code });
    } catch (e) {
      log("weather error", String(e).slice(0, 120));
    }
    this.show();
  },
};

// Reihenfolge der Bereiche in der Leiste (per Ziehen geändert, siehe
// hookSpacesOrder): Liste der Knopf-IDs; ohne Eintrag Thunderbirds Reihenfolge.
// Gilt auch für das Bereiche-Menü bei ausgeblendeter Leiste
const SPACES_ORDER_PREF = "extensions.mailcards.spacesOrder";
const SpacesOrder = {
  IDS: ["mailButton", "addressBookButton", "calendarButton", "tasksButton", "chatButton"],
  MENU: {
    mailButton: "spacesPopupButtonMail",
    addressBookButton: "spacesPopupButtonAddressBook",
    calendarButton: "spacesPopupButtonCalendar",
    tasksButton: "spacesPopupButtonTasks",
    chatButton: "spacesPopupButtonChat",
  },
  current() {
    const saved = Services.prefs.getStringPref(SPACES_ORDER_PREF, "").split(",").filter(id => this.IDS.includes(id));
    return [...new Set([...saved, ...this.IDS])];
  },
  isCustom() {
    return this.current().join() != this.IDS.join();
  },
  save(ids) {
    const clean = [...new Set([...ids.filter(id => this.IDS.includes(id)), ...this.IDS])];
    if (clean.join() == this.IDS.join()) {
      Services.prefs.clearUserPref(SPACES_ORDER_PREF);
    } else {
      Services.prefs.setStringPref(SPACES_ORDER_PREF, clean.join(","));
    }
  },
  // Bereiche-Menü: Einträge umstellen (order wirkt im Menü nicht); die
  // übrigen Einträge (Einstellungen, Leiste zeigen) bleiben dahinter
  sortMenu(d, ids) {
    const items = ids.map(id => d.getElementById(this.MENU[id])).filter(Boolean);
    const parent = items[0]?.parentNode;
    if (!parent || items.some(item => item.parentNode != parent)) {
      return;
    }
    const all = [...parent.children];
    const anchor = all[Math.max(...items.map(item => all.indexOf(item))) + 1] || null;
    for (const item of items) {
      parent.insertBefore(item, anchor);
    }
  },
  // negative order: vor allem anderen in der Leiste (Bereiche anderer
  // Add-ons, Einstellungen bleiben danach)
  apply(w) {
    const d = w?.document;
    const root = d?.documentElement;
    if (!root) {
      return;
    }
    const ids = this.current();
    ids.forEach((id, i) => d.getElementById(id)?.style.setProperty("order", String(i - ids.length)));
    this.sortMenu(d, ids);
    root.toggleAttribute("mc-spaces-order", this.isCustom());
  },
  reset(w) {
    const d = w?.document;
    if (!d?.documentElement) {
      return;
    }
    for (const id of this.IDS) {
      d.getElementById(id)?.style.removeProperty("order");
    }
    this.sortMenu(d, this.IDS);
    d.documentElement.removeAttribute("mc-spaces-order");
  },
};

// Fünfter Bereich (Platz des Chats in der Bereichsleiste): Chat wie bisher,
// der Bereich einer anderen Erweiterung, eine feste Webseite oder keiner.
// Höchstens fünf Bereiche – Chat und Ersatz nie gleichzeitig (sonst würden
// die Knöpfe kleiner). Der Ersatz läuft 1:1 in seinem eigenen Tab (ohne
// Today-Pane); halo.spaces leiht ihm nur Platz, Farbe und Knopf des Chats.
const FIFTH_PREF = "extensions.mailcards.fifthSpace"; // chat | addon | web | none
const FIFTH_ADDON_PREF = "extensions.mailcards.fifthSpaceAddon"; // Name des Bereichs (Knopf-ID)
const FIFTH_URL_PREF = "extensions.mailcards.fifthSpaceUrl";
const FIFTH_ICON_PREF = "extensions.mailcards.fifthSpaceIcon"; // mask | original
const FIFTH_CHOICES = ["chat", "addon", "web", "none"];
const FIFTH_ICONS = ["mask", "original"];

const FifthSpace = {
  mode() {
    const m = Services.prefs.getStringPref(FIFTH_PREF, "chat");
    return FIFTH_CHOICES.includes(m) ? m : "chat";
  },
  icon() {
    const m = Services.prefs.getStringPref(FIFTH_ICON_PREF, "mask");
    return FIFTH_ICONS.includes(m) ? m : "mask";
  },
  // nur http(s); ohne Schema wird https:// vorangestellt
  normalizeURL(text) {
    let t = String(text || "").trim();
    if (!t) {
      return "";
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) {
      t = "https://" + t;
    }
    try {
      // (im Experiment gibt es kein URL – Thunderbirds eigene Adressprüfung)
      const u = Services.io.newURI(t);
      return /^https?$/.test(u.scheme) && u.host.includes(".") ? u.spec : null;
    } catch {
      return null;
    }
  },
  url() {
    return this.normalizeURL(Services.prefs.getStringPref(FIFTH_URL_PREF, "")) || "";
  },
  // erlaubt sind nur Bereiche fremder Erweiterungen (Thunderbirds spaces-API)
  addonSpaces(w) {
    return (w?.gSpacesToolbar?.spaces || []).filter(s => s.isExtensionSpace && s.button)
      .map(s => ({ name: s.name, title: s.button.title || s.name, space: s }));
  },
  // wirksamer Zustand: Erweiterung fehlt oder Adresse ungültig → wie „keiner“
  target(w) {
    const mode = this.mode();
    if (mode == "addon") {
      const want = Services.prefs.getStringPref(FIFTH_ADDON_PREF, "");
      const hit = this.addonSpaces(w).find(s => s.name == want);
      return hit ? { mode, space: hit.space, title: hit.title } : { mode: "none" };
    }
    if (mode == "web") {
      const url = this.url();
      return url ? { mode, url, title: Services.io.newURI(url).host.replace(/^www\./, "") } : { mode: "none" };
    }
    return { mode };
  },
  isTarget(w, target, tab) {
    if (!tab) {
      return false;
    }
    if (target.mode == "addon") {
      return !!target.space.tabInSpace(tab);
    }
    if (target.mode == "web") {
      if (tab.mode?.name != "contentTab") {
        return false;
      }
      if (tab.__mcFifth) {
        return true;
      }
      try {
        return tab.browser?.currentURI?.host == Services.io.newURI(target.url).host;
      } catch {
        return false;
      }
    }
    return false;
  },
  open(w, target) {
    const tm = w.document.getElementById("tabmail");
    if (target.mode == "addon") {
      w.gSpacesToolbar.openSpace(tm, target.space);
      return;
    }
    const existing = tm.tabInfo.find(t => this.isTarget(w, target, t));
    if (existing) {
      tm.switchToTab(existing);
      return;
    }
    // wie eine App: keine Adressleiste; Links auf andere Seiten öffnen im Standardbrowser
    const tab = tm.openTab("contentTab", { url: target.url, linkHandler: "single-site", background: false });
    if (tab) {
      tab.__mcFifth = true;
    }
  },
  attach(w, restorers) {
    const d = w.document;
    const chat = d.getElementById("chatButton");
    const tm = d.getElementById("tabmail");
    if (!chat || !tm || !w.gSpacesToolbar || w.__mcFifth) {
      return;
    }
    w.__mcFifth = true;
    const root = d.documentElement;
    const item = () => d.getElementById("spacesPopupButtonChat");
    let target = { mode: "chat" };
    // Webseite: Zurück/Vor und Adresse oben in der Toolbar-Zeile (wie der
    // Chat, wie ein Browser) statt in einer eigenen Zeile darunter – die
    // Toolbar-Zeile war sonst ein leerer Streifen über der Seite. Lage aus der
    // Toolbar-Zeile, der Seite und dem Today-Knopf; neu bei jeder Größenänderung
    // der Seite (Fenster, Today-Pane)
    const webTabs = new Set();
    const placeWeb = tab => {
      const box = tab?.root?.querySelector?.(".contentTabToolbox");
      const row = d.getElementById("unifiedToolbarContainer")?.getBoundingClientRect();
      const br = tab?.browser?.getBoundingClientRect();
      if (!box || !row?.height || !br?.width || tm.currentTabInfo != tab) {
        return;
      }
      const tg = d.getElementById("mcTodayToggle")?.getBoundingClientRect();
      const left = Math.max(row.left, br.left) + 12;
      let right = Math.min(row.right, br.right) - 12;
      if (tg?.width && tg.left < right + 12) {
        right = tg.left - 12;
      }
      const st = tab.root.style;
      st.setProperty("--mc-web-top", `${Math.round(row.top)}px`);
      st.setProperty("--mc-web-h", `${Math.round(row.height)}px`);
      st.setProperty("--mc-web-left", `${Math.round(left)}px`);
      st.setProperty("--mc-web-w", `${Math.max(120, Math.round(right - left))}px`);
      tab.root.setAttribute("mc-web-bar", "");
      // Adresse nur zur Anzeige: kein Fokus über die Tabulatortaste
      if (tab.urlbar) {
        tab.urlbar.tabIndex = -1;
      }
      if (!webTabs.has(tab)) {
        webTabs.add(tab);
        tab.__mcWebRo = new w.ResizeObserver(() => placeWeb(tab));
        tab.__mcWebRo.observe(tab.browser);
      }
    };
    const unplaceWeb = tab => {
      tab.__mcWebRo?.disconnect();
      delete tab.__mcWebRo;
      tab.root?.removeAttribute?.("mc-web-bar");
      for (const v of ["--mc-web-top", "--mc-web-h", "--mc-web-left", "--mc-web-w"]) {
        tab.root?.style?.removeProperty(v);
      }
      if (tab.urlbar) {
        tab.urlbar.removeAttribute("tabindex");
      }
      webTabs.delete(tab);
    };
    const sync = () => {
      const on = (target.mode == "addon" || target.mode == "web") && this.isTarget(w, target, tm.currentTabInfo);
      chat.classList.toggle("current", on || (target.mode == "chat" && w.gSpacesToolbar.currentSpace?.button == chat));
      root.toggleAttribute("mc-fifth-current", on);
      if (on && target.mode == "web") {
        placeWeb(tm.currentTabInfo);
      }
      for (const t of [...webTabs]) {
        if (!tm.tabInfo.includes(t) || target.mode != "web") {
          unplaceWeb(t);
        }
      }
    };
    const reset = () => {
      for (const e of d.querySelectorAll("[mc-fifth-hidden]")) {
        e.removeAttribute("mc-fifth-hidden");
      }
      for (const e of [chat, item()].filter(Boolean)) {
        e.style.removeProperty("--mc-fifth-img");
        e.style.removeProperty("--mc-fifth-img-dark");
        e.removeAttribute("mc-fifth-icon");
      }
    };
    const apply = () => {
      target = this.target(w);
      reset();
      root.setAttribute("mc-fifth", target.mode);
      const mi = item();
      if (mi) {
        mi.hidden = target.mode == "none";
      }
      // höchstens fünf Bereiche: Knöpfe fremder Bereiche nie zusätzlich in der
      // Leiste (sie sind über „Fünfter Bereich: Erweiterung“ und das Bereiche-Menü da)
      for (const a of this.addonSpaces(w)) {
        a.space.button.setAttribute("mc-fifth-hidden", "");
      }
      d.getElementById("spacesToolbarAddonsOverflowButton")?.setAttribute("mc-fifth-hidden", "");
      if (target.mode == "addon" || target.mode == "web") {
        let img = "", dark = "";
        if (target.mode == "addon") {
          target.space.menuitem?.setAttribute("mc-fifth-hidden", "");
          const s = target.space.button.querySelector("img")?.style;
          img = s?.getPropertyValue("--webextension-toolbar-image") || "";
          dark = s?.getPropertyValue("--webextension-toolbar-image-dark") || "";
        } else if (this.icon() == "original") {
          img = `url("${Services.io.newURI(target.url).resolve("/favicon.ico")}")`;
        }
        for (const e of [chat, mi].filter(Boolean)) {
          e.setAttribute("mc-fifth-icon", this.icon());
          if (img) {
            e.style.setProperty("--mc-fifth-img", img);
          }
          if (dark) {
            e.style.setProperty("--mc-fifth-img-dark", dark);
          }
        }
        chat.title = target.title;
        if (mi) {
          mi.label = target.title;
        }
      } else {
        // Thunderbirds eigene Beschriftung zurück
        d.l10n?.translateElements([chat, mi].filter(Boolean));
      }
      sync();
    };
    const onClick = event => {
      if (target.mode == "addon" || target.mode == "web") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open(w, target);
      }
    };
    // auf der Leiste abfangen: Thunderbirds eigener Klick am Knopf käme sonst zuerst
    const bar = d.getElementById("spacesToolbar");
    const onBarClick = event => {
      if (event.target?.closest?.("#chatButton")) {
        onClick(event);
      }
    };
    bar.addEventListener("click", onBarClick, true);
    const onCommand = event => {
      if (event.target?.id == "spacesPopupButtonChat") {
        onClick(event);
      }
    };
    d.addEventListener("command", onCommand, true);
    const monitor = {
      monitorName: "mcFifthSpace",
      onTabTitleChanged() {},
      onTabOpened() {},
      onTabPersist() {},
      onTabRestored() {},
      onTabClosing() {},
      onTabSwitched: () => w.setTimeout(sync, 0),
    };
    tm.registerTabMonitor(monitor);
    // Bereiche anderer Erweiterungen entstehen erst nach dem Start
    const addons = d.getElementById("spacesToolbarAddonsContainer");
    let pending = false;
    const later = () => {
      if (!pending && !w.closed) {
        pending = true;
        w.setTimeout(() => {
          pending = false;
          apply();
        }, 0);
      }
    };
    const mo = addons ? new w.MutationObserver(later) : null;
    mo?.observe(addons, { childList: true });
    const prefs = [FIFTH_PREF, FIFTH_ADDON_PREF, FIFTH_URL_PREF, FIFTH_ICON_PREF];
    const obs = { observe: later };
    prefs.forEach(p => Services.prefs.addObserver(p, obs));
    apply();
    restorers?.push(() => {
      bar.removeEventListener("click", onBarClick, true);
      d.removeEventListener("command", onCommand, true);
      tm.unregisterTabMonitor(monitor);
      mo?.disconnect();
      prefs.forEach(p => Services.prefs.removeObserver(p, obs));
      reset();
      for (const t of [...webTabs]) {
        unplaceWeb(t);
      }
      if (item()) {
        item().hidden = false;
      }
      root.removeAttribute("mc-fifth");
      root.removeAttribute("mc-fifth-current");
      d.l10n?.translateElements([chat, item()].filter(Boolean));
      delete w.__mcFifth;
    });
  },
};

// Hinweis auf ein bereitliegendes Update: roter Punkt an der Einstellungen-
// Kachel der Spaces-Leiste und am Eintrag „halo.spaces“ der Einstellungen,
// oben in „halo.spaces“ eine Zeile mit „Install Now“. Mit automatischen
// Updates liegt das Update schon zurückgestellt bereit (kommt beim nächsten
// Start), sonst ist es nur gefunden (auto: false)
const UpdateNote = {
  pending: null,
  set(version, auto) {
    if (!version || version == extensionVersion) {
      return;
    }
    this.pending = { version, auto };
    for (const w of Services.wm.getEnumerator("mail:3pane")) {
      this.mark(w);
    }
    // keine Danke-Erinnerung am selben Tag (Punkt am Symbol, Ring) – siehe Thanks.due()
    Services.prefs.setStringPref(THANKS_UPDATE_DAY_PREF, Thanks.today());
    for (const fn of Thanks.listeners) {
      try {
        fn();
      } catch {}
    }
  },
  mark(w) {
    const d = w.document;
    const btn = d.getElementById("settingsButton");
    if (btn) {
      btn.toggleAttribute("mc-update", !!this.pending);
      if (this.pending) {
        btn.dataset.mcTitle ??= btn.getAttribute("title") || "";
        btn.setAttribute("title", tr("halo.spaces {version} is available", { version: this.pending.version }));
      }
    }
    // Einstellungen (falls offen): Punkt am Eintrag „halo.spaces“
    for (const tab of d.getElementById("tabmail")?.tabInfo || []) {
      const cat = tab.browser?.contentDocument?.getElementById("mcCat-" + HALO_PANE);
      cat?.toggleAttribute("mc-update", !!this.pending);
    }
  },
  // Kachel „Einstellungen“ führt bei bereitliegendem Update gleich zu halo.spaces
  hook(w, restorers) {
    const btn = w.document.getElementById("settingsButton");
    if (!btn || btn.__mcUpdateHook) {
      return;
    }
    btn.__mcUpdateHook = true;
    const onClick = event => {
      if (!this.pending || event.button) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      openHaloSettings(w);
    };
    btn.addEventListener("click", onClick, true);
    this.mark(w);
    restorers.push(() => {
      btn.removeEventListener("click", onClick, true);
      btn.removeAttribute("mc-update");
      delete btn.__mcUpdateHook;
    });
  },
  // „Install Now“: zurückgestelltes Update fortsetzen bzw. gefundenes laden und gleich einspielen
  async installNow() {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const ID = "mail-cards@sebastian.local";
    const waiting = (await AddonManager.getAllInstalls()).find(i =>
      (i.existingAddon?.id == ID || i.addon?.id == ID) && i.state == AddonManager.STATE_POSTPONED);
    if (waiting) {
      waiting.continuePostponedInstall();
      return true;
    }
    const addon = await AddonManager.getAddonByID(ID);
    if (!addon) {
      return false;
    }
    return new Promise(resolve => {
      addon.findUpdates({
        onUpdateAvailable: (_a, install) => {
          install.addListener({ onInstallPostponed: () => install.continuePostponedInstall() });
          install.install();
          resolve(true);
        },
        onNoUpdateAvailable: () => resolve(false),
        onUpdateFinished: () => {},
      }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
    });
  },
};
