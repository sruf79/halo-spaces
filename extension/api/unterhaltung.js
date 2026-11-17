/* halo.spaces – Unterhaltungsansicht (Teil der Experiment-API mailCards).
 *
 * Lädt implementation.js an der alten Stelle in dieselbe Umgebung (gemeinsamer
 * globaler Bereich der Experiment-API): die ganze Konversation als Karten in
 * der Leseansicht (ConversationCards) samt ihren Einstellungen
 * (CONVERSATION_PREF, CONVERSATION_NEWEST_PREF, CONVERSATION_MAX,
 * QUICK_REPLY_PREF) und das Einklappen des zitierten Verlaufs
 * (foldQuotedHistory) stehen danach dort direkt zur Verfügung. Zur Ladezeit
 * nur Namen nutzen, die vorher schon da sind; Namen aus implementation.js
 * (tr, log, motionMs …) erst zur Laufzeit.
 * Reihe „Code: implementation.js in Module zerlegen“ 7/8.
 */

"use strict";

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
  // browser: im eigenen Nachrichtenfenster dessen Mailansicht (about:message),
  // über der die Karten liegen – sonst die Leseansicht im Hauptfenster
  constructor(win, pane, { browser = null } = {}) {
    this.win = win;
    this.pane = pane;
    this.browser = browser;
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
    this.fitWindowTop();
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
    // eigenes Fenster: die Knöpfe oben gehören zur Mailansicht unter den
    // Karten – sie zeigt die gewählte Mail, damit Antworten, Löschen …
    // auf sie wirken (die Karten bleiben stehen, siehe hookWindowConversation)
    const hdr = card.__mcHdr, cw = this.browser?.contentWindow;
    if (cw?.displayMessage && hdr?.folder && cw.gMessage != hdr) {
      this.syncing = true;
      try {
        cw.displayMessage(hdr.folder.getUriForMsg(hdr));
      } catch (e) {
        log("conversation window select error", e);
      } finally {
        this.syncing = false;
      }
    }
  }

  // Karte der Konversation zu einer Mail (nur solange die Karten stehen)
  cardOf(hdr) {
    if (!hdr || !this.box?.isConnected || this.box.classList.contains("mc-stack")) {
      return null;
    }
    return [...this.box.querySelectorAll(".mc-conv-card")].find(c => c.__mcHdr == hdr ||
      (hdr.messageId && c.__mcHdr?.messageId == hdr.messageId)) || null;
  }

  // eigenes Fenster: Karten unter der Knopfzeile der Mailansicht beginnen
  // lassen (sie liegt oben in deren Mailkopf, mc-standalone)
  fitWindowTop() {
    if (!this.browser) {
      return;
    }
    let top = 0;
    try {
      const bar = this.browser.contentDocument?.getElementById("header-view-toolbox");
      const r = bar?.getBoundingClientRect();
      if (r?.height) {
        top = Math.ceil(r.bottom + 8);
      }
    } catch {} // gewollt: Mailansicht noch nicht geladen – ohne Abstand
    this.pane.style.setProperty("--mc-conv-top", `${top}px`);
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
      // eigenes Fenster: ohne Tab bzw. Fenster bliebe die Karte inaktiv
      // (Thunderbird zeichnet und markiert sie dann nicht)
      if (this.browser && !cw.tabOrWindow) {
        cw.tabOrWindow = this.win;
      }
      try {
        cw.displayMessage(hdr.folder.getUriForMsg(hdr), this.win.gViewWrapper);
      } catch (e) {
        log("conversation display error", e);
      }
    }, true);
    browserEl.addEventListener("MsgLoaded", () => {
      decorateAttachments(browserEl.contentDocument);
      decorateInvitation(browserEl.contentDocument);
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
