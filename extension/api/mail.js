/* halo.spaces – Mail-Zusätze (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der Stelle, an der diese Teile vorher standen,
 * in dieselbe Umgebung (gemeinsamer globaler Bereich der Experiment-API):
 * UndoSend, SendLater, TagMenus, Remind und FollowUp samt ihren Konstanten
 * stehen danach dort direkt zur Verfügung. Zur Ladezeit nur Namen nutzen, die
 * vorher schon da sind; Namen aus implementation.js (tr, enhancer, motionMs …)
 * erst zur Laufzeit.
 * Reihe „Code: implementation.js in Module zerlegen“ 2/8.
 */

"use strict";

// ---------- Senden rückgängig (wie Apple Mail) ----------
// Beim Senden verschwindet das Verfassen-Fenster sofort, unten im Hauptfenster
// steht „Senden rückgängig“. Erst nach der Wartezeit (Einstellung, Standard
// 10 s, 0 = aus) geht die Mail wirklich hinaus; „rückgängig“ zeigt das Fenster
// wieder. Eingehängt wird am cancelable Ereignis „compose-send-message“ –
// Thunderbird hat dann alle Rückfragen (Betreff, Anhang …) schon hinter sich;
// gesendet wird danach mit CompleteGenericSendMessage ohne neue Rückfragen.
// Beendet man Thunderbird währenddessen, gehen wartende Mails vorher hinaus.
const UNDO_SEND_PREF = "extensions.mailcards.undoSend";
const UNDO_SEND_CHOICES = [0, 10, 20, 30];
const UndoSend = {
  pending: new Map(), // Verfassen-Fenster → { msgType, timer, until }
  delay() {
    return Math.max(0, Services.prefs.getIntPref(UNDO_SEND_PREF, 10));
  },
  // im Verfassen-Fenster
  hook(win, cleanups) {
    if (win.__mcUndoSend) {
      return;
    }
    win.__mcUndoSend = true;
    const onSend = event => {
      const msgType = event.detail?.msgType;
      const sending = msgType == Ci.nsIMsgCompDeliverMode.Now || msgType == Ci.nsIMsgCompDeliverMode.Background;
      if (!sending || win.__mcSendNow || !this.delay() || Services.io.offline || typeof win.CompleteGenericSendMessage != "function") {
        return;
      }
      event.preventDefault(); // Thunderbird bricht ab wie bei „Abbrechen“, das Fenster bleibt
      this.hold(win, msgType);
    };
    win.addEventListener("compose-send-message", onSend, true);
    cleanups?.add(() => win.removeEventListener("compose-send-message", onSend, true));
  },
  setVisible(win, visible) {
    try {
      win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow)
        .QueryInterface(Ci.nsIBaseWindow).visibility = visible;
    } catch (e) {
      log("undo send visibility error", e);
    }
  },
  hold(win, msgType) {
    const ms = this.delay() * 1000;
    this.setVisible(win, false);
    const entry = { msgType, until: Date.now() + ms };
    entry.timer = win.setTimeout(() => this.send(win), ms);
    this.pending.set(win, entry);
    this.observeQuit();
    this.render();
  },
  async send(win) {
    const entry = this.pending.get(win);
    if (!entry) {
      return;
    }
    win.clearTimeout(entry.timer);
    this.pending.delete(win);
    this.render();
    if (win.closed) {
      return;
    }
    win.__mcSendNow = true;
    try {
      await win.CompleteGenericSendMessage(entry.msgType);
    } catch (e) {
      log("undo send error", e);
      this.setVisible(win, true);
    } finally {
      win.__mcSendNow = false;
    }
  },
  undo(win) {
    const entry = this.pending.get(win);
    if (!entry) {
      return;
    }
    win.clearTimeout(entry.timer);
    this.pending.delete(win);
    this.render();
    if (!win.closed) {
      this.setVisible(win, true);
      win.focus();
    }
  },
  // Thunderbird wird beendet: wartende Mails jetzt senden, danach beenden
  observeQuit() {
    if (this.quitObserver) {
      return;
    }
    this.quitObserver = {
      observe: async subject => {
        if (!this.pending.size) {
          return;
        }
        subject.QueryInterface(Ci.nsISupportsPRBool).data = true;
        await Promise.all([...this.pending.keys()].map(w => this.send(w)));
        Services.tm.dispatchToMainThread(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit));
      },
    };
    Services.obs.addObserver(this.quitObserver, "quit-application-requested");
    enhancer?.restorers.push(() => {
      Services.obs.removeObserver(this.quitObserver, "quit-application-requested");
      this.quitObserver = null;
      for (const w of [...this.pending.keys()]) {
        this.send(w);
      }
    });
  },
  // Hinweis unten im Hauptfenster: „Wird gesendet … Senden rückgängig“
  render() {
    for (const main of Services.wm.getEnumerator("mail:3pane")) {
      const d = main.document;
      let bar = d.getElementById("mcUndoSend");
      const last = [...this.pending.entries()].pop();
      if (!last) {
        bar?.remove();
        continue;
      }
      const [cw] = last;
      if (!bar) {
        bar = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
        bar.id = "mcUndoSend";
        bar.setAttribute("role", "status");
        const text = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
        text.className = "mc-us-text";
        const btn = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
        btn.className = "mc-us-undo";
        btn.textContent = tr("Undo Send");
        bar.append(text, btn);
        d.documentElement.append(bar);
      }
      const subject = cw.document?.getElementById("msgSubject")?.value?.trim();
      bar.querySelector(".mc-us-text").textContent = this.pending.size > 1
        ? tr("Sending {n} messages …", { n: this.pending.size })
        : subject ? tr("Sending “{s}” …", { s: subject }) : tr("Sending …");
      bar.querySelector(".mc-us-undo").onclick = () => this.undo(cw);
    }
  },
};

// ---------- Später senden (wie Apple Mail) ----------
// Pfeil neben „Senden“ im Verfassen-Fenster: „Heute 21:00“, „Morgen 8:00“
// oder eine eigene Zeit. Die Mail wird als Entwurf mit der Kopfzeile
// X-Halo-Send-At gespeichert (in der Datenbank über mailnews.customDBHeaders
// lesbar); halo.spaces sieht jede halbe Minute in den Entwürfen nach und
// schiebt fällige Mails in den Postausgang, Thunderbird sendet sie dann.
// Läuft Thunderbird zur Zeit nicht, geht die Mail beim nächsten Start hinaus.
const SEND_AT = "x-halo-send-at";
const SendLater = {
  timer: null,
  ensureHeaderIndexed() {
    const have = Services.prefs.getCharPref("mailnews.customDBHeaders", "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!have.includes(SEND_AT)) {
      Services.prefs.setCharPref("mailnews.customDBHeaders", [...have, SEND_AT].join(" "));
    }
  },
  // im Verfassen-Fenster: Pfeil mit Menü neben „Senden“
  hook(win, cleanups) {
    const doc = win.document;
    const send = doc.getElementById("button-send");
    if (!send || doc.getElementById("mcSendLater")) {
      return;
    }
    const btn = doc.createXULElement("toolbarbutton");
    btn.id = "mcSendLater";
    btn.className = "toolbarbutton-1";
    btn.setAttribute("type", "menu");
    btn.setAttribute("tooltiptext", tr("Send Later"));
    const popup = doc.createXULElement("menupopup");
    popup.id = "mcSendLaterPopup";
    btn.append(popup);
    send.after(btn);
    const item = (label, fn) => {
      const it = doc.createXULElement("menuitem");
      it.setAttribute("label", label);
      it.addEventListener("command", fn);
      return it;
    };
    const fmt = new Intl.DateTimeFormat(regionLocale(), { hour: "2-digit", minute: "2-digit" });
    popup.addEventListener("popupshowing", event => {
      if (event.target != popup) {
        return;
      }
      const now = new Date();
      const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
      const items = [item(tr("Send Now"), () => win.goDoCommand("cmd_sendButton"))];
      if (now < tonight - 5 * 60 * 1000) {
        items.push(item(tr("Send {time} Tonight", { time: fmt.format(tonight) }), () => this.schedule(win, tonight)));
      }
      items.push(item(tr("Send {time} Tomorrow", { time: fmt.format(tomorrow) }), () => this.schedule(win, tomorrow)));
      items.push(doc.createXULElement("menuseparator"));
      items.push(item(tr("Send Later …"), () => this.askTime(win, btn)));
      popup.replaceChildren(...items);
    });
    cleanups?.add(() => btn.remove());
  },
  // eigene Zeit: kleines Popover mit Datum und Uhrzeit
  askTime(win, anchor) {
    const doc = win.document;
    const X = "http://www.w3.org/1999/xhtml";
    let panel = doc.getElementById("mcSendLaterPanel");
    if (!panel) {
      panel = doc.createXULElement("panel");
      panel.id = "mcSendLaterPanel";
      panel.setAttribute("type", "arrow");
      const box = doc.createElementNS(X, "div");
      box.className = "mc-sl-box";
      const title = doc.createElementNS(X, "div");
      title.className = "mc-sl-title";
      title.textContent = tr("Send Later");
      const input = doc.createElementNS(X, "input");
      input.type = "datetime-local";
      input.className = "mc-sl-when";
      const ok = doc.createElementNS(X, "button");
      ok.className = "mc-sl-ok";
      ok.textContent = tr("Schedule");
      box.append(title, input, ok);
      panel.append(box);
      doc.documentElement.append(panel);
      ok.addEventListener("click", () => {
        const when = input.value ? new Date(input.value) : null;
        if (when && when > new Date()) {
          panel.hidePopup();
          this.schedule(win, when);
        }
      });
    }
    const input = panel.querySelector(".mc-sl-when");
    const pad = n => String(n).padStart(2, "0");
    const t = new Date(Date.now() + 60 * 60 * 1000);
    input.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;
    panel.openPopup(anchor, "after_end", 0, 4);
  },
  async schedule(win, when) {
    try {
      win.gMsgCompose.compFields.setHeader("X-Halo-Send-At", String(when.getTime()));
      await win.GenericSendMessage(Ci.nsIMsgCompDeliverMode.SaveAsDraft);
      for (let i = 0; i < 100 && win.gSaveOperationInProgress; i++) {
        await new Promise(r => win.setTimeout(r, 100));
      }
      win.close();
      this.check(true);
    } catch (e) {
      log("send later error", e);
    }
  },
  start() {
    this.ensureHeaderIndexed();
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (this.timer) {
      return;
    }
    if (!win) {
      setTimeout(() => this.start(), 3000); // Hauptfenster noch nicht offen
      return;
    }
    // Modul-Zeitgeber: ein Fenster-Zeitgeber endete mit diesem Hauptfenster,
    // auch wenn ein anderes offen bleibt – und start() setzte ihn nie wieder auf
    this.timer = setInterval(() => this.check(), 30 * 1000);
    setTimeout(() => this.check(true), 5000);
    enhancer?.restorers.push(() => {
      clearInterval(this.timer);
      this.timer = null;
    });
  },
  async draftFolders() {
    const out = new Set();
    for (const id of MailServices.accounts.allIdentities) {
      try {
        // neuere Versionen: getOrCreateDraftsFolderAsync; ESR 153: draftsFolderURI
        const uri = id.draftsFolderURI || id.draftFolder;
        const f = typeof id.getOrCreateDraftsFolderAsync == "function" ? await id.getOrCreateDraftsFolderAsync()
          : uri && (MailServices.folderLookup.getFolderForURL(uri) || MailServices.folderLookup.getOrCreateFolderForURL?.(uri));
        if (f) {
          out.add(f);
        }
      } catch {} // gewollt: Ordner unbekannt, wird übersprungen
    }
    try {
      const local = MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
      if (local) {
        out.add(local);
      }
    } catch {} // gewollt: ohne „Lokale Ordner“
    return [...out];
  },
  // fällige Entwürfe in den Postausgang, dann senden; update: Ordner vom Server auffrischen
  async check(update = false) {
    if (this.busy || Services.io.offline) {
      return;
    }
    this.busy = true;
    try {
      const now = Date.now();
      let moved = 0;
      for (const folder of await this.draftFolders()) {
        if (update && folder.server?.type == "imap") {
          try {
            folder.updateFolder(null);
            await new Promise(r => setTimeout(r, 1500));
          } catch {} // gewollt: offline bzw. Server antwortet nicht, lokaler Stand reicht
        }
        let db;
        try {
          db = folder.msgDatabase;
        } catch {
          continue;
        }
        const due = [];
        for (const hdr of db.enumerateMessages()) {
          const at = Number(hdr.getStringProperty(SEND_AT));
          if (at && at <= now && !(hdr.flags & Ci.nsMsgMessageFlags.Expunged)) {
            due.push(hdr);
          }
        }
        if (!due.length) {
          continue;
        }
        const outbox = this.outbox();
        if (!outbox) {
          break;
        }
        await new Promise(resolve => {
          MailServices.copy.copyMessages(folder, due, outbox, true, {
            QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
            onStartCopy() {},
            onProgress() {},
            setMessageKey() {},
            getMessageId() {
              return null;
            },
            onStopCopy: () => resolve(),
          }, null, false);
        });
        moved += due.length;
      }
      if (moved) {
        Services.wm.getMostRecentWindow("mail:3pane")?.SendUnsentMessages?.();
      }
    } catch (e) {
      log("send later check error", e);
    } finally {
      this.busy = false;
    }
  },
  outbox() {
    const root = MailServices.accounts.localFoldersServer?.rootFolder;
    let box = root?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
    if (!box && root) {
      try {
        box = root.createLocalSubfolder("Unsent Messages");
        box.setFlag(Ci.nsMsgFolderFlags.Queue);
      } catch {} // Kandidat fürs Protokoll: Postausgang lässt sich nicht anlegen
    }
    return box;
  },
};

// ---------- Schlagwörter in Menüs (wie die Schlagwort-Ordner) ----------
// Thunderbird füllt jedes Schlagwort-Menü mit InitMessageTags: „Markieren“
// in der Toolbar, Mail → Schlagwort in der Menüleiste, Weitere Aktionen →
// Schlagwort im Mailkopf (auch im eigenen Nachrichtenfenster). Danach sehen
// die Einträge aus wie die Schlagwort-Ordner der Ordnerliste: Name ohne
// vorangestellte Ziffer (der Kurzbefehl steht rechts), Ordnersymbol in der
// Schlagwortfarbe – gefüllt, wenn das Schlagwort gesetzt ist – statt Haken
// und farbiger Schrift. Das Symbol beginnt bündig mit dem Text der Einträge
// darüber (nicht in der Spalte der Häkchen, userChrome.css). Es ist ein Bild
// (image), damit es auch in der nativen Menüleiste von macOS gilt; ohne
// type="checkbox" gibt es dort keinen zusätzlichen Haken, den Zustand für
// cmd_toggleTag hält der Popup-Listener. Nach PR #51 von btirmarche
const TAG_FOLDER_PATH = "M3 7.8A2.3 2.3 0 0 1 5.3 5.5h3.9l2.1 2.1h7.4A2.3 2.3 0 0 1 21 9.9v7.8a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.7z";
const TagMenus = {
  // (gleicher Ordner wie --mi-folder in userChrome.css)
  icon(color, filled) {
    const c = color || "#8E8E93";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${filled ? c : "none"}" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${TAG_FOLDER_PATH}"/>${filled ? "" : '<path d="M3 10.3h18"/>'}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  },
  placeIcons(popup) {
    for (const item of popup.querySelectorAll(":scope > menuitem.mc-tag-item")) {
      const box = item.querySelector(".menu-icon");
      let img = item.querySelector(".mc-tag-icon");
      if (!img && box) {
        img = item.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.className = "mc-tag-icon";
        img.setAttribute("alt", "");
        box.after(img);
      }
      img?.setAttribute("src", item.getAttribute("image"));
    }
  },
  decorate(popup) {
    const tags = new Map(MailServices.tags.getAllTags().map(t => [t.key, t]));
    for (const item of popup.children) {
      const tag = item.localName == "menuitem" && tags.get(item.getAttribute("value"));
      if (!tag) {
        continue;
      }
      item.removeAttribute("data-l10n-id");
      item.removeAttribute("data-l10n-args");
      item.removeAttribute("style");
      item.removeAttribute("type");
      item.setAttribute("label", tag.tag);
      item.classList.add("menuitem-iconic", "mc-tag-item");
      const image = this.icon(tag.color, item.hasAttribute("checked"));
      // image für die native Menüleiste von macOS; in unseren Menüs steht
      // dasselbe Bild als eigenes Element bündig mit dem Text (userChrome.css)
      item.setAttribute("image", image);
    }
    this.placeIcons(popup);
    // Einträge, die Thunderbird erst beim Öffnen des Untermenüs aufbaut
    // (Kontextmenü), bekommen ihr Bild dann
    if (!popup.__mcTagIcons) {
      popup.__mcTagIcons = event => event.target == popup && this.placeIcons(popup);
      popup.addEventListener("popupshowing", popup.__mcTagIcons);
    }
    // ohne type="checkbox" schaltet niemand „checked“ um – das tut dieser
    // Listener vor Thunderbirds eigenem (Erfassungsphase am Popup), denn
    // cmd_toggleTag liest daraus, ob das Schlagwort gesetzt werden soll
    if (!popup.__mcTagToggle) {
      popup.__mcTagToggle = event => {
        if (event.target.classList?.contains("mc-tag-item")) {
          event.target.toggleAttribute("checked");
        }
      };
      popup.addEventListener("command", popup.__mcTagToggle, true);
    }
  },
  attach(w) {
    // InitMessageTags (Fenster, Mailkopf); im Kontextmenü der Mailansicht
    // baut mailContextMenu._initMessageTags das Untermenü „Schlagwort“
    if (typeof w.InitMessageTags == "function" && !w.__mcInitMessageTags) {
      const original = w.InitMessageTags;
      w.__mcInitMessageTags = original;
      w.InitMessageTags = function (parent, ...rest) {
        original.call(this, parent, ...rest);
        try {
          TagMenus.decorate(parent);
        } catch (e) {
          log("tag menus", e);
        }
      };
    }
    const ctx = w.mailContextMenu;
    if (typeof ctx?._initMessageTags == "function" && !ctx.__mcInitMessageTags) {
      const original = ctx._initMessageTags;
      ctx.__mcInitMessageTags = original;
      ctx._initMessageTags = function (...args) {
        original.apply(this, args);
        try {
          TagMenus.decorate(w.document.getElementById("mailContext-tagpopup"));
        } catch (e) {
          log("tag menus", e);
        }
      };
    }
  },
  attached(w) {
    return !!(w.__mcInitMessageTags || w.mailContextMenu?.__mcInitMessageTags);
  },
  detach(w) {
    if (w.__mcInitMessageTags) {
      w.InitMessageTags = w.__mcInitMessageTags;
      delete w.__mcInitMessageTags;
    }
    const ctx = w.mailContextMenu;
    if (ctx?.__mcInitMessageTags) {
      ctx._initMessageTags = ctx.__mcInitMessageTags;
      delete ctx.__mcInitMessageTags;
    }
  },
};

// ---------- Erinnern (wie „Remind Me“ in Apple Mail) ----------
// Kontextmenü der Mailliste → Erinnern: in 1 Stunde, heute Abend, morgen,
// nächste Woche. Die Mail wandert in den Ordner „Erinnern“ ihres Kontos (auf
// dem Server – so gilt es auch für andere Geräte) und kommt zur Zeit
// ungelesen in ihren Ordner zurück, mit einer Mitteilung. Gemerkt wird je
// Message-ID (überlebt das Verschieben): Zeit, Herkunfts- und Zielordner.
const REMIND_PREF = "extensions.mailcards.reminders";
const Remind = {
  timer: null,
  list() {
    try {
      const v = JSON.parse(Services.prefs.getStringPref(REMIND_PREF, "[]"));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  save(list) {
    Services.prefs.setStringPref(REMIND_PREF, JSON.stringify(list.slice(-500)));
  },
  choices() {
    const now = new Date();
    const at = (d, h) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, 0);
    const out = [["Remind Me in 1 Hour", new Date(now.getTime() + 60 * 60 * 1000)]];
    if (now.getHours() < 20) {
      out.push(["Remind Me Tonight", at(0, 21)]);
    }
    out.push(["Remind Me Tomorrow", at(1, 8)]);
    const toMonday = ((8 - now.getDay()) % 7) || 7;
    out.push(["Remind Me Next Week", at(toMonday, 8)]);
    return out;
  },
  // Ordner „Erinnern“ des Kontos, bei Bedarf angelegt (IMAP legt ihn
  // asynchron auf dem Server an – kurz darauf warten)
  async folderFor(hdr) {
    const root = hdr.folder.server.rootFolder;
    const name = tr("Remind Me");
    const get = () => (root.containsChildNamed(name) ? root.getChildNamed(name) : null);
    if (!get()) {
      root.createSubfolder(name, null);
      for (let i = 0; i < 50 && !get(); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return get();
  },
  move(src, hdrs, dest) {
    return new Promise(resolve => {
      MailServices.copy.copyMessages(src, hdrs, dest, true, {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
        onStartCopy() {},
        onProgress() {},
        setMessageKey() {},
        getMessageId() {
          return null;
        },
        onStopCopy: () => resolve(),
      }, null, false);
    });
  },
  async remind(hdrs, when) {
    const before = this.list();
    const list = before.filter(e => !hdrs.some(h => h.messageId == e.id));
    const bySrc = new Map();
    for (const hdr of hdrs) {
      const dest = await this.folderFor(hdr);
      if (!dest) {
        continue;
      }
      if (dest == hdr.folder) {
        // liegt schon im Ordner „Erinnern“: nur die Zeit neu, Herkunft bleibt
        // (sonst fiel die Erinnerung weg und die Mail kam nie zurück)
        const prev = before.find(e => e.id == hdr.messageId);
        if (prev) {
          list.push({ ...prev, at: when.getTime() });
        }
        continue;
      }
      list.push({ id: hdr.messageId, at: when.getTime(), back: hdr.folder.URI, folder: dest.URI, subject: hdr.mime2DecodedSubject || "" });
      const key = hdr.folder.URI + " " + dest.URI;
      if (!bySrc.has(key)) {
        bySrc.set(key, { src: hdr.folder, dest, hdrs: [] });
      }
      bySrc.get(key).hdrs.push(hdr);
    }
    this.save(list);
    for (const { src, dest, hdrs: group } of bySrc.values()) {
      await this.move(src, group, dest);
    }
  },
  start() {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (this.timer) {
      return;
    }
    if (!win) {
      setTimeout(() => this.start(), 3000);
      return;
    }
    // Modul-Zeitgeber (wie bei SendLater.start)
    this.timer = setInterval(() => this.check(), 30 * 1000);
    setTimeout(() => this.check(), 6000);
    enhancer?.restorers.push(() => {
      clearInterval(this.timer);
      this.timer = null;
    });
  },
  async check() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const now = Date.now();
      const list = this.list();
      const due = list.filter(e => e.at <= now);
      if (!due.length) {
        return;
      }
      // erledigte bzw. aufgegebene Einträge; gespeichert wird am Ende auf den
      // dann aktuellen Stand – Erinnerungen, die während des Zurückholens
      // dazukommen, bleiben so erhalten
      const key = e => `${e.id}\n${e.at}`;
      const done = new Set();
      for (const e of due) {
        let folder, back;
        try {
          folder = MailServices.folderLookup.getFolderForURL(e.folder);
          back = MailServices.folderLookup.getFolderForURL(e.back);
        } catch {} // gewollt: Ordner gibt es nicht mehr, Eintrag fällt weg
        const hdr = folder?.msgDatabase?.getMsgHdrForMessageID(e.id);
        if (!hdr || !back) {
          // noch nicht da (Server) – höchstens einen Tag lang weiter versuchen
          if (now - e.at >= 24 * 60 * 60 * 1000) {
            done.add(key(e));
          }
          continue;
        }
        // zurück: ungelesen wie eine neue Mail (vorher markieren – der Server
        // übernimmt die Markierung beim Kopieren)
        folder.markMessagesRead([hdr], false);
        await new Promise(r => setTimeout(r, 500));
        await this.move(folder, [hdr], back);
        done.add(key(e));
        this.notify(e);
      }
      this.save(this.list().filter(e => !done.has(key(e))));
    } catch (err) {
      log("remind check error", err);
    } finally {
      this.busy = false;
    }
  },
  notify(entry) {
    try {
      const alerts = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
      const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
      alert.init("halo-remind-" + entry.id, "", tr("Reminder"), entry.subject || tr("(no subject)"), false, "", null, null, null, null, false, false);
      alerts.showAlert(alert, null);
    } catch (e) {
      debugLog("remind alert", String(e).slice(0, 120));
    }
  },
  // nur bei Mails, die man verschieben kann (nicht in Entwürfen, Vorlagen,
  // Postausgang oder Newsgruppen) – Kontextmenü und Menüleiste gleich
  canRemind(hdrs) {
    const F = Ci.nsMsgFolderFlags;
    const list = [...(hdrs || [])];
    return list.length > 0 && !list.some(h => !h.folder || h.folder.isSpecialFolder(F.Drafts | F.Queue | F.Templates, true) || h.folder.server?.type == "nntp");
  },
  // Kontextmenü der Mailliste: Untermenü „Erinnern“ nach „Markieren“
  hookMenu(doc) {
    const popup = doc.getElementById("mailContext");
    const mark = doc.getElementById("mailContext-mark");
    if (!popup || !mark || doc.getElementById("mcRemindMenu")) {
      return;
    }
    const win = doc.defaultView;
    const menu = doc.createXULElement("menu");
    menu.id = "mcRemindMenu";
    menu.setAttribute("label", tr("Remind Me"));
    const inner = doc.createXULElement("menupopup");
    menu.append(inner);
    mark.after(menu);
    const fmt = new Intl.DateTimeFormat(regionLocale(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
    inner.addEventListener("popupshowing", event => {
      if (event.target != inner) {
        return;
      }
      inner.replaceChildren(...this.choices().map(([label, when]) => {
        const it = doc.createXULElement("menuitem");
        it.setAttribute("label", `${tr(label)} (${fmt.format(when)})`);
        it.addEventListener("command", () => {
          const hdrs = win.gDBView?.getSelectedMsgHdrs?.() || [];
          this.remind([...hdrs], when).catch(e => log("remind error", e));
        });
        return it;
      }));
    });
    const onShow = event => {
      if (event.target != popup) {
        return;
      }
      menu.hidden = !this.canRemind(win.gDBView?.getSelectedMsgHdrs?.() || []);
    };
    popup.addEventListener("popupshowing", onShow);
    this.start();
    enhancer?.addWinRestorer(win, () => {
      popup.removeEventListener("popupshowing", onShow);
      menu.remove();
    });
  },
};

// ---------- Nachfassen (wie „Follow Up“ in Apple Mail) ----------
// Eigene Mails, auf die nach 3 Tagen (bis 14) noch keine Antwort kam, zeigt
// halo.spaces als Hinweis über dem Posteingang: „Keine Antwort: „Betreff“ an
// Anna“ – „Nachfassen“ öffnet die Antwort an dieselben Empfänger, ✕ blendet
// ihn für diese Mail aus. Geantwortet = irgendeine Mail in einem Posteingang
// der letzten 30 Tage verweist auf sie (References/In-Reply-To).
const FOLLOWUP_PREF = "extensions.mailcards.followUp"; // Schalter „Follow-Up Suggestions“
const FOLLOWUP_DISMISSED_PREF = "extensions.mailcards.followUpDismissed";
const FollowUp = {
  cache: null,
  dismissed() {
    try {
      return new Set(JSON.parse(Services.prefs.getStringPref(FOLLOWUP_DISMISSED_PREF, "[]")));
    } catch {
      return new Set();
    }
  },
  dismiss(id) {
    const set = [...this.dismissed(), id].slice(-300);
    Services.prefs.setStringPref(FOLLOWUP_DISMISSED_PREF, JSON.stringify(set));
    this.cache = null;
  },
  // die neueste unbeantwortete eigene Mail (oder null); höchstens alle 10 Minuten neu
  candidate() {
    if (this.cache && Date.now() - this.cache.time < 10 * 60 * 1000) {
      return this.cache.hdr;
    }
    const F = Ci.nsMsgFolderFlags;
    const now = Date.now() * 1000; // PRTime
    const DAY = 24 * 60 * 60 * 1000 * 1000;
    const answered = new Set();
    const mine = new Set([...MailServices.accounts.allIdentities].map(i => (i.email || "").toLowerCase()).filter(Boolean));
    const sent = [];
    for (const server of MailServices.accounts.allServers) {
      let root;
      try {
        root = server.rootFolder;
      } catch {
        continue;
      }
      for (const folder of root.descendants) {
        const inbox = folder.getFlag(F.Inbox), isSent = folder.getFlag(F.SentMail);
        if (!inbox && !isSent) {
          continue;
        }
        let db;
        try {
          db = folder.msgDatabase;
        } catch {
          continue;
        }
        for (const hdr of db.enumerateMessages()) {
          if (inbox && now - hdr.date < 30 * DAY) {
            for (let i = 0; i < hdr.numReferences; i++) {
              answered.add(hdr.getStringReference(i));
            }
          } else if (isSent && now - hdr.date >= 3 * DAY && now - hdr.date <= 14 * DAY) {
            sent.push(hdr);
          }
        }
      }
    }
    const dismissed = this.dismissed();
    const others = h => (h.recipients + "," + h.ccList).toLowerCase().split(",").some(a => {
      const m = a.match(/[^<\s"]+@[^>\s"]+/);
      return m && !mine.has(m[0]);
    });
    const open = sent.filter(h => !answered.has(h.messageId) && !dismissed.has(h.messageId) &&
      !(h.flags & Ci.nsMsgMessageFlags.Replied) && others(h)).sort((a, b) => b.date - a.date);
    this.cache = { time: Date.now(), hdr: open[0] || null };
    return this.cache.hdr;
  },
  // Hinweis über der Mailliste, nur im Posteingang bzw. allen Posteingängen
  render(a3) {
    const doc = a3?.document;
    const pane = doc?.getElementById("threadPane");
    const tree = doc?.getElementById("threadTree");
    if (!pane || !tree) {
      return;
    }
    let bar = doc.getElementById("mcFollowUp");
    const folder = a3.gFolder;
    const inbox = !!folder && (folder.getFlag(Ci.nsMsgFolderFlags.Inbox) ||
      (folder.getFlag(Ci.nsMsgFolderFlags.Virtual) && /inbox/i.test(folder.URI)));
    let hdr = null;
    try {
      hdr = inbox && Services.prefs.getBoolPref(FOLLOWUP_PREF, true) ? this.candidate() : null;
    } catch (e) {
      log("follow up error", e);
    }
    if (!hdr) {
      bar?.remove();
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    if (!bar) {
      bar = doc.createElementNS(X, "div");
      bar.id = "mcFollowUp";
      const text = doc.createElementNS(X, "span");
      text.className = "mc-fu-text";
      const go = doc.createElementNS(X, "button");
      go.className = "mc-fu-go";
      go.textContent = tr("Follow Up");
      const close = doc.createElementNS(X, "button");
      close.className = "mc-fu-close";
      close.title = tr("Dismiss");
      close.setAttribute("aria-label", tr("Dismiss"));
      bar.append(text, go, close);
      tree.before(bar);
    }
    let to = "";
    try {
      const p = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedRecipients || hdr.recipients)[0];
      to = p?.name || p?.email || "";
    } catch {} // gewollt: Empfänger nicht lesbar, leer
    const days = Math.floor((Date.now() * 1000 - hdr.date) / (24 * 60 * 60 * 1e6));
    bar.querySelector(".mc-fu-text").textContent = tr("No reply for {d} days: “{s}” to {to}", { d: days, s: hdr.mime2DecodedSubject || "", to });
    bar.querySelector(".mc-fu-go").onclick = () => {
      const uri = hdr.folder.getUriForMsg(hdr);
      MailServices.compose.OpenComposeWindow(null, hdr, uri, Ci.nsIMsgCompType.ReplyAll, Ci.nsIMsgCompFormat.Default, null, null, a3.msgWindow);
      this.dismiss(hdr.messageId);
      this.render(a3);
    };
    bar.querySelector(".mc-fu-close").onclick = () => {
      this.dismiss(hdr.messageId);
      this.render(a3);
    };
  },
  hook(a3) {
    if (a3.__mcFollowUp) {
      return;
    }
    a3.__mcFollowUp = true;
    // (Fenster schon zu: kein Zeitgeber mehr – sonst NS_ERROR_NOT_INITIALIZED)
    const update = () => !a3.closed && a3.setTimeout(() => this.render(a3), 0);
    a3.addEventListener("folderURIChanged", update);
    // Schalter in den Einstellungen wirkt sofort, nicht erst beim Ordnerwechsel
    const prefObs = { observe: update };
    Services.prefs.addObserver(FOLLOWUP_PREF, prefObs);
    update();
    enhancer?.addWinRestorer(a3, () => {
      Services.prefs.removeObserver(FOLLOWUP_PREF, prefObs);
      a3.removeEventListener("folderURIChanged", update);
      a3.document.getElementById("mcFollowUp")?.remove();
      delete a3.__mcFollowUp;
    });
  },
};

// ---------- Codes in E-Mails (wie Apple Mail, GitHub #54) ----------
// Bestätigungs- und Anmeldecodes erkennen und über der Mail zum Kopieren
// anbieten. findCode ist eine reine Funktion (Logik-Tests in
// tests/logik/codes.test.mjs): Ein Code ist eine Folge von 4–8 Ziffern (auch
// „123 456“, „1234-5678“, „G-123456“) oder 5–8 Großbuchstaben und Ziffern
// gemischt, die in derselben Zeile wie ein Wort wie Code/OTP/TAN steht oder
// in einer der zwei nächsten kurzen Zeilen danach; der Betreff zählt für sich
// und geht vor. Verworfen werden Teile größerer Zahlen (Telefonnummern,
// Datum, Uhrzeit), Jahreszahlen, Beträge und Einheiten, Nummern nach Wörtern
// wie Bestellnummer/Telefon, Gutschein-, Post- und Quelltext-Codes, Links und
// Adressen. Datenschutz: Codes werden nie protokolliert oder gesendet.
const CODE_WORD = /(\p{L}*)([ -]?)(code|código|codice|otp|passcode|pin|tan|one-time password|einmalpasswort|einmalkennwort)(?!\p{L})/giu;
// Codes, die keine Anmelde- oder Bestätigungscodes sind
const CODE_NOT = new Set(["bar", "qr", "source", "quell", "quelltext", "post", "postal", "zip", "area", "country", "länder",
  "promo", "promotional", "discount", "rabatt", "gutschein", "aktions", "voucher", "coupon", "gift", "geschenk", "referral",
  "dress", "error", "fehler", "status", "swift", "bank", "sort", "tracking", "sendungs", "de", "en", "uni", "color", "colour",
  "farb", "html", "morse", "zahlen", "programm", "program"]);
// direkt angehängt erlaubt: pushTAN, smsTAN, mTAN, chipTAN, photoTAN, appTAN
const CODE_TAN_PREFIX = new Set(["push", "sms", "m", "chip", "photo", "app", "i"]);
const CODE_LINE_NOT = /checkout|discount|rabatt|gutschein|coupon|voucher|% off|\bsale\b|angebot/i;
const CODE_CAND = /(?<![\p{L}\p{N}_])(?:G-)?(\d{3,4}[ -]\d{3,4}|\d{4,8}|(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z][A-Z0-9]*[A-Z])[A-Z0-9]{5,8})(?![\p{L}\p{N}_])/gu;
const CODE_BEFORE_NOT = /(?<!\p{L})(?:tel|telefon|phone|fax|mobil|mobile|call|nr|no|iban|bic|blz|plz|konto|account|ref|referenz|reference|order|invoice|ticket|id|number|nummer|kundennummer|bestellnummer|rechnungsnummer|version|room|raum|zimmer)\.?:?\s*#?$/iu;
const CODE_AFTER_NOT = /^(?:\s?[-./:,]\d|\s{1,2}\(?\d|\s?(?:€|eur\b|usd\b|chf\b|gbp\b|\$|%|uhr\b|h\b|min\b|km\b|kg\b|mb\b|gb\b|px\b|cm\b|mm\b))/iu;

// Wörter wie Code/OTP/TAN in einer Zeile: [{ start, end }]
function codeWords(line) {
  const found = [];
  for (const m of line.matchAll(CODE_WORD)) {
    const prefix = m[1].toLowerCase(), joined = !m[2] && prefix, word = m[3].toLowerCase();
    if (word == "code" || word == "código" || word == "codice") {
      if (CODE_NOT.has(prefix) || /^\s*of conduct/i.test(line.slice(m.index + m[0].length))) {
        continue;
      }
    } else if (joined && !(word == "tan" && CODE_TAN_PREFIX.has(prefix))) {
      continue; // „Sultan“, „Spinning“ …
    }
    found.push({ start: m.index + m[1].length + m[2].length, end: m.index + m[0].length });
  }
  return found;
}

// mögliche Codes in einer Zeile: [{ code, start }]
function codeCandidates(line) {
  const found = [];
  for (const m of line.matchAll(CODE_CAND)) {
    const raw = m[1], start = m.index, end = m.index + m[0].length;
    const groups = raw.split(/[ -]/);
    if (groups.length == 2 && groups[0].length != groups[1].length) {
      continue; // „555-0199“, „123 4567“: eher eine Telefonnummer
    }
    if (/^(?:19|20)\d\d$/.test(raw)) {
      continue; // Jahreszahl
    }
    const before = line.slice(0, start), after = line.slice(end);
    if (/[+#€$£¥]\s?$/.test(before) || /\d[\s\-./:,()]{1,2}$/.test(before) || CODE_BEFORE_NOT.test(before) || CODE_AFTER_NOT.test(after)) {
      continue;
    }
    found.push({ code: groups.join(""), start });
  }
  return found;
}

// Code in einem Block (Betreff bzw. Mailtext); "" wenn keiner
function codeInLines(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || CODE_LINE_NOT.test(line)) {
      continue;
    }
    for (const word of codeWords(line)) {
      const cands = codeCandidates(line);
      const pick = cands.find(c => c.start >= word.end) || cands.filter(c => c.start < word.start).at(-1);
      if (pick) {
        return pick.code;
      }
      // „Dein Code:“ und der Code allein in einer der nächsten zwei Zeilen
      const next = lines.slice(i + 1).filter(Boolean).slice(0, 2);
      for (const l of next) {
        if (l.length <= 40 && !CODE_LINE_NOT.test(l)) {
          const c = codeCandidates(l)[0];
          if (c) {
            return c.code;
          }
        }
      }
    }
  }
  return "";
}

function findCode(subject, body) {
  const clean = s => String(s || "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ");
  const lines = s => clean(s).split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim());
  return codeInLines(lines(subject)) || codeInLines(lines(body));
}

// Hinweis über der geöffneten Mail mit dem gefundenen Code und „Kopieren“
// (#mcCodeBanner): Baustein und Gestaltung wie der Verteiler-Hinweis
// (#mcListBanner), ohne Symbol. In der Einzelansicht und im Fenster einer
// Mail, nicht in den Karten der Konversation und nicht im Spam-Ordner. In die
// Zwischenablage als vertraulich markiert (Verlaufsprogramme speichern ihn
// nicht); der Code wird nie protokolliert
function decorateCode(target) {
  try {
    const doc = target?.document || target?.contentDocument || target?.ownerDocument || target;
    const win = doc?.defaultView;
    if (!win || !doc.getElementById || win.frameElement?.classList?.contains("mc-conv-browser")) {
      return;
    }
    doc.getElementById("mcCodeBanner")?.remove();
    const hdr = win.gMessage;
    const body = doc.getElementById("messagepane")?.contentDocument?.body;
    const view = doc.getElementById("msgHeaderView");
    if (!hdr || !body || !view || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    try {
      if (hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk)) {
        return;
      }
    } catch {}
    const code = findCode(hdr.mime2DecodedSubject || hdr.subject, String(body.innerText || body.textContent || "").slice(0, 8000));
    if (!code) {
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    const banner = doc.createElementNS(X, "div");
    banner.id = "mcCodeBanner";
    banner.dataset.mcFor = hdr.messageId;
    const text = doc.createElementNS(X, "span");
    text.className = "mc-lb-text";
    text.textContent = tr("Verification code: {code}", { code });
    const copy = doc.createElementNS(X, "button");
    copy.className = "mc-lb-unsub mc-cb-copy";
    copy.type = "button";
    copy.textContent = tr("Copy");
    copy.addEventListener("click", () => {
      const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
      try {
        helper.copyString(code, null, Ci.nsIClipboardHelper.Sensitive ?? 1);
      } catch {
        helper.copyString(code);
      }
      copy.textContent = tr("Copied");
    });
    const close = doc.createElementNS(X, "button");
    close.className = "mc-lb-close";
    close.type = "button";
    close.title = tr("Close");
    close.setAttribute("aria-label", tr("Close"));
    close.addEventListener("click", () => banner.remove());
    banner.append(text, copy, close);
    view.before(banner);
  } catch (e) {
    log("code banner error", String(e?.name || "Fehler"));
  }
}
