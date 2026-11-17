/* halo.spaces – halo.spaces-Fenster (Teil der Experiment-API mailCards).
 *
 * Methoden von CardEnhancer, ausgelagert aus implementation.js: Rückmeldung
 * (sendFeedback), Updates (autoUpdate, findUpdate), Info- und
 * Willkommensfenster (openHaloWindow, welcomeStep, wireHaloWindow …) und „Allen
 * antworten“ (alwaysReplyAll). Sie stehen hier in der Klasse
 * EnhancerHaloFenster; implementation.js lädt diese Datei mit loadPart() direkt
 * nach CardEnhancer und hängt die Methoden unverändert an
 * CardEnhancer.prototype an (this ist also weiter der CardEnhancer). Zur
 * Ladezeit nur Namen nutzen, die vorher schon da sind; alles andere erst zur
 * Laufzeit. Reihe „Code: implementation.js in Module zerlegen“ 8/8.
 */

"use strict";

class EnhancerHaloFenster {
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
      `chrome,dialog=yes,centerscreen,resizable=no,width=360,height=${395 + (platformNote ? 64 : 0)}`);
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

  // Fenster einer geöffneten Mail wie im Vorbild: immer Antworten, Allen
  // antworten, Weiterleiten – Thunderbird zeigt bei nur einem Empfänger allein
  // „Antworten“. Nachrichtengruppen (Followup) und Feeds bleiben, wie sie sind.
  // (Bleibt nach dem Abschalten bis zum Schließen des Fensters; ruft nur
  // Thunderbirds eigene Fassung und schaltet sichtbare Knöpfe um)
  alwaysReplyAll(win) {
    const orig = win.UpdateReplyButtons;
    if (typeof orig != "function" || orig.__mcReplyAll) {
      return;
    }
    const wrapped = function (...args) {
      const result = orig.apply(this, args);
      const d = win.document;
      const reply = d.getElementById("hdrReplyButton"), all = d.getElementById("hdrReplyAllButton");
      const sender = d.getElementById("hdrReplyToSenderButton");
      if (reply && all && sender && !reply.hidden && win.gMessage) {
        reply.hidden = true;
        all.hidden = false;
        sender.hidden = false;
      }
      return result;
    };
    wrapped.__mcReplyAll = true;
    win.UpdateReplyButtons = wrapped;
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
    // Weiterempfehlen: kurzer Text mit Link in die Zwischenablage, 2,5 s
    // Bestätigung im Knopf (grün), danach wieder „Recommend“
    const recommend = $("recommend");
    const recLabel = recommend?.querySelector(".label");
    let recTimer = null;
    recommend?.addEventListener("click", () => {
      let ok = false;
      try {
        if (!extensionHomepage) {
          throw new Error("no homepage");
        }
        Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper)
          .copyString(`${tr("halo.spaces gives Thunderbird a calm, modern look on macOS. Free. Screenshots and download:")} ${extensionHomepage}`);
        ok = true;
      } catch (e) {
        log("recommend copy failed", String(e));
      }
      recLabel.textContent = ok ? tr("Text with link copied ✓") : tr("Copying not possible");
      recommend.classList.toggle("copied", ok);
      recommend.classList.toggle("failed", !ok);
      hw.clearTimeout(recTimer);
      recTimer = hw.setTimeout(() => {
        recLabel.textContent = tr("Recommend");
        recommend.classList.remove("copied", "failed");
      }, 2500);
    });
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
}
