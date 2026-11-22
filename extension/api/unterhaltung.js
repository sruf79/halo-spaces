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
    // Hinweis „nur dieser Ordner“ nur bei ausgeschaltetem Suchindex: eine gerade
    // eingegangene Mail kennt der Index oft noch nicht (oder legt sie kurz in eine
    // eigene Konversation) – das ist kein Grund für den Hinweis
    const indexed = Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false);
    if (indexed) {
      try {
        list = await this.fromGloda(hdr);
      } catch (e) {
        log("conversation gloda error", e);
      }
    }
    // der Faden im Ordner gehört immer dazu (auch die gewählte Mail selbst, deren
    // Indexeintrag noch auf eine verschobene Kopie zeigen kann): sonst fehlte
    // einer frisch eingegangenen Mail, die der Index noch nicht kennt, ihre
    // Konversation, und Thunderbirds Zusammenfassung blieb stehen
    list.push(...this.fromThread(hdr));
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
          // Der Index sucht nach Ordner und Schlüssel. Ist er nicht auf dem
          // neuesten Stand (Ordner komprimiert, Mail verschoben, Konto neu
          // abgeglichen), kann unter diesem Schlüssel eine andere Mail stehen –
          // dann käme die Konversation dieser fremden Mail (GitHub #60).
          // Nur nehmen, wenn die Message-ID stimmt, sonst Faden im Ordner.
          const item = collection.items.find(i => i.headerMessageID == hdr.messageId);
          const conversation = item?.conversation;
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
    this.shown = null;
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
    this.shown = null;
    if (!hdr || !this.enabled()) {
      this.reveal();
      return;
    }
    // angezeigte Mail merken: kommt eine Antwort darauf an, wird aus der
    // Einzelmail eine Konversation (arrived)
    this.shown = { hdr, thread };
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
    const cards = messages.map(m => {
      const card = this.makeCard(m, own);
      card.classList.toggle("mc-selected", m == selected || m.messageId == selected.messageId);
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
      this.keepInView(box, sel);
    }
  }

  // Karte einer Mail (noch leer, loadCard füllt sie); eigene Mail: in einem
  // Gesendet-Ordner oder von einer eigenen Adresse
  makeCard(m, own = this.ownAddresses()) {
    const card = this.win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    card.className = "mc-conv-card";
    let mine = false;
    try {
      mine = !!m.folder?.getFlag(Ci.nsMsgFolderFlags.SentMail) ||
        own.has((MailServices.headerParser.parseDecodedHeader(m.mime2DecodedAuthor || m.author)[0]?.email || "").toLowerCase());
    } catch {} // gewollt: Absender nicht lesbar – als fremde Mail zeigen
    card.classList.toggle("mc-own", mine);
    card.dataset.messageId = m.messageId;
    card.__mcHdr = m;
    return card;
  }

  // gehört die Mail zu dieser Konversation: sie verweist auf eine ihrer Mails
  // (References, In-Reply-To) oder steht im selben Faden desselben Ordners
  related(hdr, known) {
    const ids = new Set(known.map(m => m?.messageId).filter(Boolean));
    if (!hdr?.messageId || ids.has(hdr.messageId)) {
      return false;
    }
    try {
      for (let i = 0; i < hdr.numReferences; i++) {
        if (ids.has(hdr.getStringReference(i))) {
          return true;
        }
      }
    } catch {} // gewollt: Verweise nicht lesbar – nur der Faden zählt
    return known.some(m => m?.folder && m.folder == hdr.folder && m.threadId == hdr.threadId);
  }

  // Thunderbird zeigt eine neu eingegangene Mail einer gewählten Konversation
  // nicht von selbst an (die Auswahl bleibt, die Leseansicht wird nicht neu
  // aufgebaut). Wie Apple Mail: ihre Karte erscheint an ihrem Platz, Auswahl
  // und Scrollstand bleiben; war nur die Einzelmail zu sehen, wird daraus die
  // Konversation. Mails in Papierkorb und Spam bleiben draußen
  arrived(hdr) {
    const F = Ci.nsMsgFolderFlags;
    if (!hdr || !this.enabled() || hdr.folder?.getFlag(F.Trash) || hdr.folder?.getFlag(F.Junk)) {
      return;
    }
    const box = this.box;
    if (box?.isConnected && !box.classList.contains("mc-stack")) {
      const cards = [...box.querySelectorAll(".mc-conv-card")];
      if (!this.related(hdr, cards.map(c => c.__mcHdr))) {
        return;
      }
      const card = this.makeCard(hdr);
      const newest = Services.prefs.getBoolPref(CONVERSATION_NEWEST_PREF, true);
      const after = cards.find(c => (newest ? c.__mcHdr.date < hdr.date : c.__mcHdr.date > hdr.date));
      if (after) {
        after.before(card);
      } else {
        cards.at(-1).after(card);
      }
      const count = box.querySelector(".mc-conv-count");
      if (count) {
        count.textContent = tr("{n} messages", { n: cards.length + 1 });
      }
      this.observer?.observe(card);
      this.refreshToolbar();
      return;
    }
    // Einzelmail zu sehen, jetzt mit Antwort: Konversation nachholen (ohne
    // Thunderbirds Ansicht zu verdecken – sie bleibt, bis die Karten da sind)
    const shown = this.shown;
    if (!shown || !this.related(hdr, [shown.hdr])) {
      return;
    }
    const token = this.seq;
    this.collect(shown.hdr).then(({ messages, indexed }) => {
      if (token == this.seq && this.shown == shown && !this.box && messages.length >= 2) {
        this.render(messages, shown.hdr, { indexed, thread: shown.thread });
      }
    }).catch(e => log("conversation arrived error", e));
  }

  // gewählte Karte oben halten, bis der Nutzer selbst scrollt: die Karten
  // darüber sind beim ersten Scrollen noch leer und wachsen erst beim Laden –
  // vorher blieb die Ansicht oben stehen und zeigte die neueste Mail statt
  // der gewählten (GitHub #60)
  keepInView(box, card) {
    const win = this.win;
    let expected = null, height = 0;
    const align = () => {
      if (this.box != box || !card.isConnected) {
        stop();
        return;
      }
      card.scrollIntoView({ block: "start" });
      expected = box.scrollTop;
      height = box.scrollHeight;
    };
    // Scrollen an eine andere Stelle als die zuletzt gesetzte kommt vom Nutzer –
    // dann nicht mehr eingreifen. Solange die Karte gehalten wird, führt
    // Thunderbird die Scrollposition beim Wachsen der Karten nicht selbst nach
    // (overflow-anchor), damit jede fremde Position eindeutig der Nutzer ist.
    // Vorher entschied der Vergleich der Gesamthöhe: wuchs zwischen dem Scrollen
    // des Nutzers und dem nächsten Bild eine noch ladende Karte, galt sein
    // Scrollen als Wachsen und die Ansicht sprang zur gewählten Karte zurück.
    // Ausnahme: der Inhalt ist kürzer geworden, die Ansicht steht am Ende an
    const onScroll = () => {
      if (expected == null || Math.abs(box.scrollTop - expected) <= 2) {
        return;
      }
      if (box.scrollHeight < height && box.scrollTop >= box.scrollHeight - box.clientHeight - 2) {
        return;
      }
      stop();
    };
    const resize = new win.ResizeObserver(() => align());
    const stop = () => {
      resize.disconnect();
      box.removeEventListener("scroll", onScroll);
      box.style.overflowAnchor = "";
    };
    this.keepStop?.();
    this.keepStop = stop;
    box.style.overflowAnchor = "none";
    for (const c of box.querySelectorAll(".mc-conv-card")) {
      resize.observe(c);
    }
    box.addEventListener("scroll", onScroll, { passive: true });
    win.requestAnimationFrame(align);
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
    // andere Karte angeklickt: nicht mehr zur zuerst gewählten zurückspringen
    this.keepStop?.();
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
    // Karten sind keine eigene Anzeige: ihr „MsgLoaded“/„MsgsLoaded“ stiege sonst bis zum Fenster auf, und
    // Thunderbird meldete anderen Erweiterungen je Karte eine angezeigte Mail (messageDisplay.onMessageDisplayed,
    // onMessagesDisplayed; Hörer am Fenster in der Aufstiegsphase). Eigene Hörer (hier an der Karte und mit
    // capture weiter oben) laufen trotzdem; die gewählte Mail meldet Thunderbirds Anzeige unter den Karten
    for (const type of ["MsgLoaded", "MsgsLoaded"]) {
      browserEl.addEventListener(type, event => event.stopPropagation());
    }
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
