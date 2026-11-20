/* halo.spaces – Karten der Mailliste (Teil der Experiment-API mailCards).
 *
 * Methoden von CardEnhancer, ausgelagert aus implementation.js: Aussehen und
 * Absender (decorate, fillSender, fillAvatar), Suche wie Apple Mail
 * (mailSearch, glodaHits …), Markiert-Ordner, Geburtstage (syncBirthdays),
 * Mailkopf (decorateHeader, hookHeaderAvatar …) und Vorschau (requestPreview,
 * flushPreviews …). Sie stehen hier in der Klasse EnhancerMailkarten;
 * implementation.js lädt diese Datei mit loadPart() direkt nach CardEnhancer
 * und hängt die Methoden unverändert an CardEnhancer.prototype an (this ist
 * also weiter der CardEnhancer). Zur Ladezeit nur Namen nutzen, die vorher
 * schon da sind; alles andere erst zur Laufzeit. Reihe „Code: implementation.js
 * in Module zerlegen“ 8/8.
 */

"use strict";

class EnhancerMailkarten {
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
    } catch {} // gewollt: Ordner nicht lesbar, dann entscheidet die Zeile
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
    } catch {} // gewollt: Zeile nicht mehr in der Ansicht, dann ohne eigene Mail
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
    } catch {} // gewollt: ohne „Lokale Ordner“ kein Merkordner (unten behandelt)
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
    } catch {} // gewollt: ohne „Lokale Ordner“ kein Suchordner (unten behandelt)
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
    // Suche aus einem Kontakt („Search“ am Kontakt): immer alle Postfächer
    if (this.searchAllMailboxes) {
      return null;
    }
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
  // Eingrenzungen aus dem Vorschlagsmenü (Kapseln im Suchfeld,
  // suchvorschlag.js) müssen zusätzlich alle zutreffen. Thunderbird wertet
  // die Bedingungen der Reihe nach aus, ((a ODER b) UND c): darum zuerst die
  // ODER-Gruppe des freien Texts, danach die Eingrenzungen mit UND
  searchTerms(session, text, body = true, filters = this.mailSearchFilters) {
    const A = Ci.nsMsgSearchAttrib;
    const O = Ci.nsMsgSearchOp;
    const terms = [];
    const add = (attrib, op, fill, and = false) => {
      const term = session.createTerm();
      term.attrib = attrib;
      term.op = op;
      const value = term.value;
      value.attrib = attrib;
      fill(value);
      term.value = value;
      term.booleanAnd = and;
      terms.push(term);
    };
    if (text) {
      for (const attrib of body ? [A.Subject, A.Sender, A.ToOrCC, A.Body] : [A.Subject, A.Sender, A.ToOrCC]) {
        add(attrib, O.Contains, v => (v.str = text));
      }
      const date = searchDate(text);
      if (date) {
        add(A.Date, O.Is, v => (v.date = date.getTime() * 1000));
      }
    }
    for (const spec of searchFilterSpecs(filters)) {
      add(A[spec.attrib], O.Contains, v => (v.str = spec.value), true);
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
    // Eingrenzungen (Kapseln im Suchfeld) allein sind auch eine Suche
    const filters = searchFilterSpecs(this.mailSearchFilters);
    if (!term && !filters.length) {
      this.mailSearchTerm = "";
      this.mailSearchFilters = [];
      this.searchAllMailboxes = false;
      this.searchRun = null;
      a3.document.documentElement.removeAttribute("mc-search-stage");
      a3.document.documentElement.removeAttribute("mc-search-gloda");
      if (folder && this.isSearchFolder(a3.gFolder)) {
        let back = null;
        try {
          back = this.searchPrevURI && MailServices.folderLookup.getFolderForURL(this.searchPrevURI);
        } catch {} // gewollt: vorheriger Ordner nicht mehr da, dann zurück zum Standardkonto
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
    // (mit Eingrenzungen ohne den Index: seine Treffer gelten nur dem freien Text)
    if (!this.glodaEnabled() || term.length < GLODA_MIN_CHARS || filters.length) {
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

  // „Search“ an einem geöffneten Kontakt: Thunderbird öffnet dafür eine eigene
  // Suchansicht ohne Ordnerliste (Gloda-Tab). Stattdessen wie Apple Mail in
  // den Mail-Space wechseln, die Adresse ins Suchfeld oben setzen und über
  // alle Postfächer suchen, gesendet wie empfangen; die Ordnerliste bleibt
  contactMailSearch(top, address) {
    const term = (address || "").trim();
    const tm = top.document.getElementById("tabmail");
    const mailTab = tm?.tabInfo.find(t => t.mode?.name == "mail3PaneTab");
    if (!term || !mailTab) {
      return false;
    }
    tm.switchToTab(mailTab);
    this.mailSearchFilters = [];
    this.searchAllMailboxes = true;
    // nach dem Tabwechsel: der Wechsel setzt das Suchfeld auf den Begriff des
    // Bereichs zurück (syncSearchForTab)
    top.setTimeout(() => {
      this.searchAllMailboxes = true;
      this.mailSearchFilters = [];
      this.renderSearchCaps(top);
      top.document.querySelector("#unifiedToolbarContent global-search-bar")?.overrideSearchTerm?.(term);
      this.mailSearch(top, term);
      top.__mcSearchPlaceholder?.();
    }, 0);
    return true;
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
      // ohne freien Text oder mit „Message contains“ gibt es keine schnelle
      // erste Stufe nur über die Kopfzeilen
      const body = seeded > 0 || !term || searchFilterSpecs(this.mailSearchFilters).some(s => s.attrib == "Body");
      wrapper.searchTerms = this.searchTerms(wrapper.searchTermsSession, term, body);
      wrapper.onlineSearch = false;
      MailServices.accounts.saveVirtualFolders();
      run.stage = body ? "body" : "headers";
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
      } catch {} // gewollt: Ordner ohne Datenbank, nichts zu leeren
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
        } catch {} // gewollt: Karte ohne lesbare vCard, dann ohne Geburtstag
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
        } catch {} // gewollt: Fenster ohne Kalender oder schon geschlossen
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
      doc.getElementById("mcCodeBanner")?.remove();
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
    } catch {} // gewollt: kein Zugriff auf das Rahmenelement, dann normale Mailansicht
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
        } catch {} // gewollt: Befehl nicht prüfbar, Knopf bleibt nutzbar
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
  // Stilregel dort hinein. Dazu die Karte: Inhalt mittig, Schließen als runder
  // grauer Symbolknopf (24 px); Flächenfarben setzt userChrome.css.
  hookNotificationLayout(doc) {
    const win = doc.defaultView;
    const box = doc.getElementById("mail-notification-top");
    if (!win || !box || box.__mcLayout) {
      return;
    }
    box.__mcLayout = true;
    const CSS_TEXT = `
      div.container { align-items: center; gap: 10px; min-height: 0; padding: 6px 8px 6px 12px;
        border-radius: inherit; box-shadow: none; }
      .content { flex-wrap: nowrap; column-gap: 12px; }
      .text-container { flex: 1 1 auto; min-width: 0; padding-block: 0; }
      .text-content { padding-block: 0; }
      .actions.active { flex: none; align-items: center; }
      :host([value="remoteContent"]) img.icon { color: var(--mt-text-secondary); }
      moz-button.close {
        margin: 0;
        --button-size-icon: 24px;
        --button-min-height: 24px;
        --button-border-radius: 999px;
        --icon-size: 12px;
        --button-background-color-ghost: var(--mt-control);
        --button-background-color-ghost-hover: var(--mt-control-hover);
        --button-background-color-ghost-active: var(--mt-control-hover);
        --button-text-color-ghost: var(--mt-text-secondary);
        --button-text-color-ghost-hover: var(--mt-text);
        --button-text-color-ghost-active: var(--mt-text);
        --button-border-color-ghost: transparent;
        --button-border-color-ghost-hover: transparent;
        --button-border-color-ghost-active: transparent;
      }
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
    } catch {} // gewollt: Ordner ohne Titel, Kopf ohne Ordnernamen
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
    } catch {} // gewollt: Konto nicht lesbar, dann ohne Farbpunkt
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

    // Hinweis bei Verteilern (List-ID/List-Unsubscribe), nicht im Spam-Ordner;
    // der Code-Hinweis einer anderen Mail geht hier schon (der neue kommt bei „MsgLoaded“)
    doc.getElementById("mcListBanner")?.remove();
    const codeBanner = doc.getElementById("mcCodeBanner");
    if (codeBanner && codeBanner.dataset.mcFor != hdr.messageId) {
      codeBanner.remove();
    }
    const data = win.currentHeaderData || {};
    const isList = !!(data["list-id"] || data["list-unsubscribe"]);
    let junk = false;
    try {
      junk = !!hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk);
    } catch {} // gewollt: Ordner nicht lesbar, dann wie kein Spam
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
        } catch {} // gewollt: Absender nicht lesbar, Rückfrage ohne Namen
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
    } catch {} // Kandidat fürs Protokoll: Spam-Merkmal nicht lesbar, das Logo wird dann geladen
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
        } catch {} // Kandidat fürs Protokoll: Vorschau einer Zeile nicht gesetzt (Zeile schon weg ist gewollt)
      }
    }
  }
}
