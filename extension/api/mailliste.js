/* halo.spaces – Mailliste (Teil der Experiment-API mailCards).
 *
 * Methoden von CardEnhancer, ausgelagert aus implementation.js: Konversation in
 * Leseansicht und eigenem Fenster (hookConversation, hookWindowConversation …),
 * Ansicht und Sortierung, Filter „Ungelesen“, Postausgang und Sendefehler, neue
 * Mails, Thunderbirds Liste (patch) und Ordnerliste (hookFolderEvents,
 * decorateFolders …). Sie stehen hier in der Klasse EnhancerMailliste;
 * implementation.js lädt diese Datei mit loadPart() direkt nach CardEnhancer
 * und hängt die Methoden unverändert an CardEnhancer.prototype an (this ist
 * also weiter der CardEnhancer). Zur Ladezeit nur Namen nutzen, die vorher
 * schon da sind; alles andere erst zur Laufzeit. Reihe „Code: implementation.js
 * in Module zerlegen“ 8/8.
 */

"use strict";

class EnhancerMailliste {
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
    delete pane.clearAll;
    delete pane.displayWebPage;
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
    // Thunderbird leert die Leseansicht auch ohne displayMessage (Ordnerwechsel:
    // clearAll; Webseite: displayWebPage) – dann auch die Karten weg, sonst
    // blieb die Konversation des alten Ordners stehen bzw. erschien noch
    // nachträglich, wenn ihre Abfrage erst danach fertig wurde
    const clear = pane.clearAll, web = pane.displayWebPage;
    if (typeof clear == "function") {
      pane.clearAll = function (...args) {
        conv.hide();
        return clear.apply(this, args);
      };
    }
    if (typeof web == "function") {
      pane.displayWebPage = function (...args) {
        conv.hide();
        return web.apply(this, args);
      };
    }
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
      // Thunderbirds eigene Konversationsansicht (mail.thread.conversation.enabled, ab
      // 15x im Konfigurationseditor) baut sich bei einer gewählten Zeile sonst
      // zusätzlich unter den Karten auf – solange halo die Konversation zeigt, für
      // diesen Aufruf abschalten (danach gilt wieder Thunderbirds Einstellung)
      const ownConv = messages.length && win.gDBView?.selection?.count == 1 && conv.enabled() && !groupHeadSelected();
      if (ownConv) {
        pane.classList.add("mc-conv-pending");
      }
      // mehrere Zeilen markiert: Stapel statt Zusammenfassung (ohne Aufblitzen)
      const stack = messages.length >= 2 && win.gDBView?.selection?.count >= 2;
      if (stack) {
        pane.classList.add("mc-conv-pending");
      }
      let result;
      const own = ownConv && "isConversationView" in this && Object.getOwnPropertyDescriptor(this, "isConversationView");
      if (ownConv && "isConversationView" in this && (!own || own.configurable)) {
        Object.defineProperty(this, "isConversationView", { value: false, configurable: true, writable: true });
        try {
          result = many.call(this, messages);
        } finally {
          delete this.isConversationView;
          if (own) {
            Object.defineProperty(this, "isConversationView", own);
          }
        }
      } else {
        result = many.call(this, messages);
      }
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
      delete pane.clearAll;
      delete pane.displayWebPage;
      delete pane.__mcConv;
      delete pane.__mcConversation;
    });
  }

  // Nachricht im eigenen Fenster (Doppelklick, auch auf eine zugeklappte
  // Konversation): wie in der Leseansicht die ganze Konversation als Karten,
  // über Thunderbirds Einzelansicht; deren Knopfzeile oben bleibt frei und
  // wirkt auf die gewählte Karte (ConversationCards.select). Nur die
  // Mailansicht des Fensters selbst, nicht die der Karten
  hookWindowConversation(mwin) {
    const browser = mwin.frameElement;
    const stack = browser?.parentNode;
    if (browser?.id != "messageBrowser" || !stack || typeof mwin.displayMessage != "function" || mwin.displayMessage.__mcConv) {
      return;
    }
    const top = mwin.top;
    let conv = stack.__mcConversation;
    if (!conv) {
      conv = new ConversationCards(top, stack, { browser });
      stack.__mcConversation = conv;
      stack.classList.add("mc-conv-window");
      // die Knopfzeile hat erst nach dem Laden der Mail ihren Platz
      const fit = () => conv.fitWindowTop();
      browser.addEventListener("MsgLoaded", fit, true);
      top.addEventListener("resize", fit);
      this.addWinRestorer(top, () => {
        browser.removeEventListener("MsgLoaded", fit, true);
        top.removeEventListener("resize", fit);
        conv.hide();
        stack.classList.remove("mc-conv-window");
        stack.style.removeProperty("--mc-conv-top");
        delete stack.__mcConversation;
      });
    }
    const orig = mwin.displayMessage;
    const wrapped = function (uri, ...rest) {
      // Klick auf eine Karte: die Mailansicht darunter folgt, die Karten bleiben
      if (conv.syncing) {
        return orig.call(this, uri, ...rest);
      }
      conv.hide();
      if (uri && conv.enabled()) {
        stack.classList.add("mc-conv-pending");
      }
      const result = orig.call(this, uri, ...rest);
      if (uri) {
        conv.show(conv.hdrFromURI(uri));
      }
      return result;
    };
    wrapped.__mcConv = true;
    mwin.displayMessage = wrapped;
    this.addWinRestorer(top, () => {
      if (mwin.displayMessage === wrapped) {
        mwin.displayMessage = orig;
      }
    });
    // Mail schon angezeigt (Fenster war schneller): gleich nachholen
    if (mwin.gMessage) {
      conv.show(mwin.gMessage);
    }
  }

  // Fenster einer geöffneten Mail wie Apple Mail: rechts am Fensterrand
  // Drucken, Stern mit Auswahlpfeil (Markieren-Menü) und Ordner mit
  // Auswahlpfeil (Verschieben); Stern im Mailkopf bleibt Thunderbirds eigener
  // Knopf, die übrigen sind neu (mc-hdr-…), Lage und Kapseln in userChrome.css
  hookWindowHeaderTools(mwin) {
    const doc = mwin.document;
    const bar = doc.getElementById("header-view-toolbar");
    if (!bar || doc.getElementById("mcHdrPrintButton")) {
      return;
    }
    const button = (id, tip) => {
      const b = doc.createXULElement("toolbarbutton");
      b.id = id;
      b.className = "toolbarbutton-1 message-header-view-button mc-hdr-tool";
      b.setAttribute("tooltiptext", tip);
      return b;
    };
    const print = button("mcHdrPrintButton", tr("Print"));
    print.addEventListener("command", () => mwin.commandController?.doCommand("cmd_print"));

    // Pfeil neben dem Stern: Thunderbirds Befehle zum Markieren (gelesen,
    // ungelesen, Stern, Werbung) – Beschriftung von Thunderbird, sonst eigene
    const flag = button("mcHdrFlagMenuButton", tr("More"));
    flag.setAttribute("type", "menu");
    const flagPopup = doc.createXULElement("menupopup");
    flagPopup.id = "mcHdrFlagPopup";
    const items = [
      ["cmd_markAsRead", "mailContext-markRead", "Mark as Read"],
      ["cmd_markAsUnread", "mailContext-markUnread", "Mark as Unread"],
      null,
      ["cmd_markAsFlagged", "mailContext-markFlagged", "Star"],
      null,
      ["cmd_markAsJunk", "mailContext-markAsJunk", "Mark as Spam"],
      ["cmd_markAsNotJunk", "mailContext-markAsNotJunk", "Mark as Not Spam"],
    ];
    for (const entry of items) {
      if (!entry) {
        flagPopup.append(doc.createXULElement("menuseparator"));
        continue;
      }
      const [cmd, from, fallback] = entry;
      const item = doc.createXULElement("menuitem");
      item.dataset.mcCommand = cmd;
      const orig = doc.getElementById(from);
      if (orig?.getAttribute("data-l10n-id")) {
        item.setAttribute("data-l10n-id", orig.getAttribute("data-l10n-id"));
      } else {
        item.setAttribute("label", orig?.getAttribute("label") || tr(fallback));
      }
      if (cmd == "cmd_markAsFlagged") {
        item.setAttribute("type", "checkbox");
      }
      flagPopup.append(item);
    }
    flagPopup.addEventListener("popupshowing", event => {
      if (event.target != flagPopup) {
        return;
      }
      const ctrl = mwin.commandController;
      for (const item of flagPopup.querySelectorAll("menuitem")) {
        const cmd = item.dataset.mcCommand;
        let enabled = true;
        try {
          enabled = ctrl ? ctrl.isCommandEnabled(cmd) : true;
        } catch {} // gewollt: Befehl unbekannt, Eintrag bleibt aktiv
        item.disabled = !enabled;
        if (cmd == "cmd_markAsFlagged") {
          item.toggleAttribute("checked", !!mwin.gMessage?.isFlagged);
        }
      }
    });
    flagPopup.addEventListener("command", event => {
      const cmd = event.target.dataset?.mcCommand;
      if (cmd) {
        mwin.commandController?.doCommand(cmd);
      }
    });
    flag.append(flagPopup);

    // Ordner mit Pfeil: Thunderbirds Ordnermenü zum Ablegen (zuletzt benutzt,
    // Favoriten, alle Konten) – Auswahl verschiebt die Mail dorthin
    const move = button("mcHdrMoveButton", tr("Move to Folder"));
    move.setAttribute("type", "menu");
    const movePopup = doc.createXULElement("menupopup", { is: "folder-menupopup" });
    movePopup.id = "mcHdrMovePopup";
    movePopup.setAttribute("mode", "filing");
    movePopup.setAttribute("showFileHereLabel", "true");
    movePopup.setAttribute("showRecent", "true");
    movePopup.setAttribute("showFavorites", "true");
    movePopup.addEventListener("command", event => {
      const folder = event.target._folder;
      if (folder) {
        mwin.commandController?.doCommand("cmd_moveMessage", folder);
      }
    });
    move.append(movePopup);
    const sync = () => {
      let canMove = !!mwin.gMessage;
      try {
        canMove &&= mwin.commandController?.isCommandEnabled("cmd_moveMessage") ?? true;
      } catch {} // gewollt: Befehle noch nicht bereit, dann zählt nur die angezeigte Mail
      move.disabled = !canMove;
      print.disabled = !mwin.gMessage;
    };
    const browser = mwin.frameElement;
    browser?.addEventListener("MsgLoaded", sync, true);
    bar.append(print, flag, move);
    sync();
    this.addWinRestorer(mwin.top, () => {
      browser?.removeEventListener("MsgLoaded", sync, true);
      print.remove();
      flag.remove();
      move.remove();
    });
  }

  // Fenster einer geöffneten Mail: Klappt der Nutzer die Anhänge per Chevron
  // zu bzw. auf, wird das Fenster genau um den frei werdenden bzw. gebrauchten
  // Platz der Liste kleiner bzw. größer – auch ein selbst vergrößertes Fenster,
  // nicht auf Inhaltsgröße (Maintainer 14.11.2026). Sonst füllte der Mailtext
  // den Platz und die Zeile „n attachments“ sprang an den unteren Rand.
  // Thunderbird ruft toggleAttachmentList nur bei Klick und Taste mit
  // updateFocus auf – das automatische Auf- und Zuklappen beim Laden einer Mail
  // ändert die Fenstergröße nicht; maximiert und im Vollbild bleibt sie auch
  hookWindowAttachments(mwin) {
    const top = mwin.top;
    const orig = mwin.toggleAttachmentList;
    if (typeof orig != "function" || orig.__mcFitWindow) {
      return;
    }
    // Kacheln wie im Hauptfenster (Download-Knopf je Kachel, Name fett bis
    // zwei Zeilen, Größe darunter): dessen Aufruf bei „MsgLoaded“ erreicht
    // dieses Fenster nicht, ohne ihn blieb Thunderbirds Zeile (Name einzeilig
    // in eigener Schrift, Größe rechts, kein Knopf)
    const decorate = () => {
      decorateAttachments(mwin.document);
      decorateInvitation(mwin.document);
      decorateCode(mwin.document);
    };
    const browser = mwin.frameElement;
    browser?.addEventListener("MsgLoaded", decorate, true);
    decorate();
    this.addWinRestorer(top, () => browser?.removeEventListener("MsgLoaded", decorate, true));
    const wrapped = function (expanded, updateFocus, ...rest) {
      const view = mwin.document.getElementById("attachmentView");
      const before = updateFocus && view ? view.getBoundingClientRect().height : null;
      const result = orig.call(this, expanded, updateFocus, ...rest);
      if (before != null) {
        try {
          // eigene Höhe der Liste gleich setzen (sonst erst im nächsten Bild)
          view.__mcFitHeight?.();
          const delta = Math.round(view.getBoundingClientRect().height - before);
          if (delta && top.windowState == top.STATE_NORMAL && !top.fullScreen) {
            top.resizeBy(0, delta);
          }
        } catch (e) {
          log("attachment window fit error", e);
        }
      }
      return result;
    };
    wrapped.__mcFitWindow = true;
    mwin.toggleAttachmentList = wrapped;
    this.addWinRestorer(top, () => {
      if (mwin.toggleAttachmentList === wrapped) {
        mwin.toggleAttachmentList = orig;
      }
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
    } catch {} // gewollt: Fenster schon geschlossen, nichts mehr anzuzeigen
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
          } catch {} // gewollt: Einblenden ist nur Zierde, Zeile schon weg
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

  // Doppelklick (bzw. Enter, „Öffnen“) auf eine zugeklappte Konversation:
  // wie Apple Mail ein Fenster mit der neuesten Mail. Thunderbird zählt zur
  // Auswahl einer zugeklappten Konversation alle ihre Mails und öffnete für
  // jede ein eigenes Fenster
  hookOpenThread(win) {
    const cc = win.commandController;
    const orig = cc?._callbackCommands?.cmd_openMessage;
    if (typeof orig != "function" || orig.__mcThread) {
      return;
    }
    const wrapped = function (event, ...rest) {
      try {
        const view = win.gDBView, tree = win.threadTree;
        const idx = tree?.selectedIndex ?? -1;
        const single = view?.selection?.count == 1 && idx >= 0;
        if (single && view.isContainer(idx) && !view.isContainerOpen(idx)) {
          const hdrs = [...(view.getSelectedMsgHdrs() || [])];
          if (hdrs.length > 1) {
            const newest = hdrs.reduce((a, b) => (b.dateInSeconds > a.dateInSeconds ? b : a));
            const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
            MailUtils.displayMessages([newest], win.gViewWrapper, win.top.document.getElementById("tabmail"),
              event?.button == 1, event?.shiftKey);
            return undefined;
          }
        }
      } catch (e) {
        log("open thread error", String(e).slice(0, 160));
      }
      return orig.call(this, event, ...rest);
    };
    wrapped.__mcThread = true;
    cc._callbackCommands.cmd_openMessage = wrapped;
    this.addWinRestorer(win, () => {
      if (cc._callbackCommands.cmd_openMessage === wrapped) {
        cc._callbackCommands.cmd_openMessage = orig;
      }
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
    safely("open thread", () => this.hookOpenThread(win));
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
      safely("find bar", () => hookFindbarDone(mb));
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
        } catch {} // gewollt: ohne Schriftgrößen-Modul bleibt die Grundhöhe
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
      if ((self.mailSearchTerm || self.mailSearchFilters?.length) && win.gFolder && !self.isSearchFolder(win.gFolder)) {
        self.searchAllMailboxes = false; // Suche aus dem Kontakt: jetzt im gewählten Ordner
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
    // Ohne Posteingang (leeres Profil, nur „Lokale Ordner“) wählt Thunderbird beim Start den leeren Sammelordner
    // und sein Öffnen scheitert (NS_ERROR_ILLEGAL_VALUE in nsIMsgDBView.open): dann erst später einschalten
    try {
      const hatPosteingang = MailServices.accounts.allFolders.some(f => f.flags & Ci.nsMsgFolderFlags.Inbox);
      if (!hatPosteingang) {
        // alle 2 s erneut prüfen, bis ein Konto mit Posteingang besteht (neues Konto, Posteingang angelegt)
        if (!win.closed) {
          win.setTimeout(() => this.enableUnifiedOnce(win, tries + 1), 2000);
        }
        return;
      }
    } catch (e) {
      log("unified folders inbox check error", e);
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
    // Abschnittstitel („Favourites“, „Tags“, „Unread Folders“ …) lassen sich
    // einklappen wie die Konten (Maintainer 17.11.2026: „Bezüglich 1 und 2
    // folge ich deiner Empfehlung“): derselbe Pfeil links vom Titel, nur beim
    // Überfahren sichtbar; der Zustand bleibt über Neustarts. Eigenes Merkmal
    // statt Thunderbirds Klasse „collapsed“ – die sucht an jedem eingeklappten
    // Vorfahren Ordner-Methoden (updateNewMessages), die der Abschnitt nicht hat
    const COLLAPSED_PREF = "extensions.mailcards.collapsedFolderModes";
    const collapsedModes = () => Services.prefs.getStringPref(COLLAPSED_PREF, "").split(",").filter(Boolean);
    const modeTwisties = () => {
      const zu = collapsedModes();
      for (const head of tree.querySelectorAll(':scope > li[data-mode]:not([data-mode="all"]) > .mode-container')) {
        if (!head.querySelector(":scope > .mc-mode-twisty")) {
          const tw = doc.createElement("div");
          tw.className = "twisty mc-mode-twisty";
          const img = doc.createElement("img");
          img.className = "twisty-icon";
          img.src = "chrome://messenger/skin/icons/new/nav-down-sm.svg";
          img.alt = "";
          tw.append(img);
          head.prepend(tw);
        }
        setAttr(head.parentElement, "mc-collapsed", zu.includes(head.parentElement.dataset.mode));
      }
    };
    const onModeClick = event => {
      const head = event.target.closest?.(".mode-container");
      const li = head?.parentElement;
      if (!li || li.parentElement !== tree || event.button != 0 || event.target.closest(".mode-button")) {
        return;
      }
      const zu = collapsedModes().filter(m => m != li.dataset.mode);
      if (!li.hasAttribute("mc-collapsed")) {
        zu.push(li.dataset.mode);
      }
      Services.prefs.setStringPref(COLLAPSED_PREF, zu.join(","));
      modeTwisties();
    };
    tree.addEventListener("click", onModeClick);
    // Pfeiltasten überspringen die Zeilen eingeklappter Abschnitte wie bei
    // eingeklappten Konten (die gewählte Zeile bleibt erreichbar)
    let rowsGetter = null;
    for (let p = Object.getPrototypeOf(tree); p && !rowsGetter; p = Object.getPrototypeOf(p)) {
      rowsGetter = Object.getOwnPropertyDescriptor(p, "rows")?.get || null;
    }
    if (rowsGetter) {
      Object.defineProperty(tree, "rows", {
        configurable: true,
        get() {
          return rowsGetter.call(this).filter(r => !r.closest("li[mc-collapsed]") || r.classList.contains("selected"));
        },
      });
    }
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
      modeTwisties();
      // wie Apple Mail: nur ausgeblendet, solange nichts darin liegt
      const hideLocal = localIsEmpty();
      for (const li of tree.querySelectorAll('li[is="folder-tree-row"]')) {
        const modeLi = li.closest("li[data-mode]");
        const mode = modeLi?.dataset.mode;
        let folder = null;
        try {
          folder = MailServices.folderLookup.getFolderForURL(li.uri);
        } catch {} // gewollt: Zeile ohne gültigen Ordner, dann ohne Ordnerdaten
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
      } catch {} // gewollt: Fenster schon geschlossen
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
      tree.removeEventListener("click", onModeClick);
      delete tree.rows;
      tree.querySelectorAll(".mc-mode-twisty").forEach(tw => tw.remove());
      tree.querySelectorAll(":scope > li[mc-collapsed]").forEach(li => li.removeAttribute("mc-collapsed"));
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
        } catch {} // gewollt: Thunderbird setzt den Namen beim nächsten Aufbau selbst
      }
      for (const header of tree.querySelectorAll(":scope > li[data-mode] > .mode-container .mode-name")) {
        doc.l10n?.setAttributes(header, `folder-pane-mode-header-${header.closest("li[data-mode]").dataset.mode}`);
      }
    });
  }
}
