/* halo.spaces – Oberfläche (Teil der Experiment-API mailCards).
 *
 * Methoden von CardEnhancer, ausgelagert aus implementation.js: Suchfeld
 * (styleSearch), Seitenleiste und Bereiche (animateSidebar, animateSpaces),
 * Listenköpfe (updateListHeader …), eigene Fenster für Mails und PDF,
 * Symbolleisten (applyToolbarOnce, trackToolbarOffset …), Symbole
 * (registerIconVars) und Kontextmenü der Mail (hookMailContext). Sie stehen
 * hier in der Klasse EnhancerOberflaeche; implementation.js lädt diese Datei
 * mit loadPart() direkt nach CardEnhancer und hängt die Methoden unverändert an
 * CardEnhancer.prototype an (this ist also weiter der CardEnhancer). Zur
 * Ladezeit nur Namen nutzen, die vorher schon da sind; alles andere erst zur
 * Laufzeit. Reihe „Code: implementation.js in Module zerlegen“ 8/8.
 */

"use strict";

class EnhancerOberflaeche {
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
    // sichtbarer Fortschritt 0 → 1 vom Anfang zum Ende (für Werte der Toolbar, die mitgleiten)
    ab.__mcFortschritt = () => curve(k);
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
      delete ab.__mcFortschritt;
      delete ab.__mcGapRun;
      delete ab.__mcMidRun;
      ab.__mcMidEnde?.();
      delete ab.__mcMidEnde;
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
    } catch {} // gewollt: kein Tab oder keine Nachricht, nicht markiert
    li.toggleAttribute("mc-starred", starred);
  }

  // Trefferzahl einer Suche: Thunderbirds Zähler der Ansicht läuft beim Start
  // jeder Suche wieder von 0 an, während die gemerkten Treffer schon in der
  // Liste stehen – darum mindestens die Zeilen der Liste (ohne Gruppenköpfe)
  searchHitCount(ab) {
    const view = ab.gDBView;
    let n = 0;
    try {
      n = view?.numMsgsInView || 0;
    } catch {} // gewollt: Ansicht ohne Zähler, dann nur die Zeilen
    const rows = view?.rowCount || 0;
    if (rows <= n) {
      return n;
    }
    let mails = rows;
    if (view.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort) {
      const DUMMY = 0x20000000; // MSG_VIEW_FLAG_DUMMY: Kopfzeile einer Gruppe
      for (let i = 0; i < rows; i++) {
        if (view.getFlagsAt(i) & DUMMY) {
          mails--;
        }
      }
    }
    return Math.max(n, mails);
  }

  updateListHeader(w) {
    const d = w.document;
    const box = d.getElementById("mcListHeader");
    const tab = d.getElementById("tabmail")?.currentTabInfo;
    if (box && tab?.mode?.name == "addressBookTab") {
      const cw = tab.browser?.contentWindow;
      this.updateAbHeader(box, cw);
      // Seite beim Tabwechsel noch nicht aufgebaut (langsamer Rechner, frisch geöffnetes Adressbuch): Titel, Anzahl
      // und Fokus-Umleitung erst, wenn Thunderbird sie fertig meldet – sonst blieben sie aus, bis man den Tab wechselt
      // (Pfeiltasten wirkten nach „Abbrechen“ eines neuen Kontakts nicht, die Kopfzeile zeigte die der Mailliste)
      const browser = tab.browser;
      if (browser && !cw?.__mcHeaderHook && !browser.__mcAbWait) {
        browser.__mcAbWait = true;
        browser.addEventListener("about-addressbook-ready", () => {
          delete browser.__mcAbWait;
          w.setTimeout(() => this.updateListHeader(w), 0);
        }, { capture: true, once: true });
      }
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
        const n = this.searchHitCount(ab);
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
      // Thunderbird setzt den Fokus an mehreren Stellen auf sein Suchfeld über der
      // Liste (Abbrechen eines neuen Kontakts, letzter Kontakt gelöscht, leere
      // Liste); das ist ausgeblendet (Suche oben in der Toolbar), der Fokus ginge
      // ins Leere und Pfeiltasten wirkten erst nach einem Klick – dann in die
      // Kontaktliste wie Apple Kontakte
      const ownFocus = search && !Object.hasOwn(search, "focus");
      if (ownFocus) {
        const focusSearch = search.focus;
        search.focus = function (...args) {
          if (!this.getClientRects().length && list.table?.body) {
            return list.table.body.focus();
          }
          return focusSearch.apply(this, args);
        };
      }
      this.addWinRestorer(cw, () => {
        if (ownFocus) {
          delete search.focus;
        }
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
      // nur Kontakte zählen: Verteilerlisten stehen bei Thunderbird als eigene Zeilen
      // zwischen den Kontakten, Apple Kontakte zählt sie nicht mit
      const view = list.view;
      let n = view?.rowCount ?? 0;
      if (view?.getCardFromRow) {
        for (let i = n - 1; i >= 0; i--) {
          if (view.getCardFromRow(i)?.isMailList) {
            n--;
          }
        }
      }
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
        // ebenso der Platz der Ampel-Fläche im Fluss der Zeile (84 → 0 px, userChrome.css --mc-tl-flow)
        row.style.setProperty("--mc-tl-flow", `${Math.round(84 * (1 - v / FULL))}px`);
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
      row?.style.removeProperty("--mc-tl-flow");
    };
    w.__mcSpacesAnimating = true;
    w.__mcSpacesJump = v => set(v * FULL);
    if (showing) {
      set(0);
      spaces.toggleToolbar(false);
      w.__mcSpacesRuhen?.(); // (ruhende Leiste sichtbar machen, im Klick statt erst nach dem Beobachter)
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
        // gleich ruhen lassen (sichtbar bleibt sie nicht, aufgebaut schon): sonst nähme ein erzwungenes Layout danach
        // (realign) die Leiste ganz aus dem Aufbau, und der Beobachter baute sie im nächsten Bild wieder auf
        w.__mcSpacesRuhen?.();
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
      const { EXTENSION_PREFIX: EXT } = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");
      const ml = state.mail;
      if (ml && OLD_MAIL_TOOLBAR.every((id, i) => ml[i] == id) &&
          ml.slice(OLD_MAIL_TOOLBAR.length).every(id => id.startsWith(EXT))) {
        state.mail = [...APPLE_TOOLBAR, ...ml.slice(OLD_MAIL_TOOLBAR.length)];
        changed = true;
      }
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
      const browserLeft = rectOf(browserEl).left;
      const paneRight = browserLeft + listRight;
      // für die übrigen Bereiche merken: dort beginnen die Knöpfe an derselben
      // Stelle, und die Kontaktliste im Adressbuch ist so breit wie die Mailliste
      this.mcButtonsLeft = paneRight + 6;
      if (listRect.width > 1) {
        this.mcListWidth = Math.round(listRect.width);
      }
      // Bezug ist der Anfang des ersten Abstandhalters (die Toolbar hat
      // eigenen Innenabstand); +6 px wie der Einzug in Apple Mail.
      const lead = leadSpacer(content);
      const start = rectOf(lead || content).left;
      let offset = Math.max(0, Math.round(paneRight - start + 6));
      // nie links vom Seitenleisten-Knopf beginnen
      const toggle = top.document.getElementById("spacesPinnedButton");
      const tb = rectOf(toggle);
      if (tb && tb.width) {
        offset = Math.max(offset, Math.round(tb.right - start + 12));
      }
      // auch während die Today-Pane ein-/ausgleitet: sonst blendet das
      // Nachmessen mitten in der Animation Knöpfe um (ein 45-ms-Hänger)
      const animating = !top.__mcDry && (top.__mcSpacesAnimating || win.__mcAnimating ||
        top.document.getElementById("today-pane-panel")?.__mcAnimating);
      const row = top.document.getElementById("unifiedToolbarContainer");
      const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
      // Während einer Ein-/Ausblend-Bewegung alles, was die Kanten weiter unten brauchen, schon hier messen – vor dem
      // ersten Schreiben an die Toolbar-Zeile. Jede Variable dort lässt Thunderbird alle rund 150 Elemente der Zeile
      // neu berechnen, sobald danach wieder gemessen wird; mit Messen und Schreiben im Wechsel waren das in der Mail
      // vier Durchgänge je Bild, jetzt sind es zwei (gemessen im Hauptfenster: rund 580 statt 390 neu berechnete
      // Elemente je Bild, Stil-Zeit der Bewegung etwa ein Siebtel kleiner). Ordnerliste, Ansicht und Zeile ändern ihre
      // Lage durch diese Variablen nicht. Der Anfang der Knöpfe (Ende des ersten Abstandhalters) folgt dem Einzug genau, solange der
      // Abstandhalter vorn steht und nicht gestaucht ist – das zeigt das Bild davor (Ende = Anfang + bisheriger Einzug);
      // sonst wird wie bisher nach dem Schreiben gemessen
      let vorab = null;
      if (animating && row) {
        const offsetBefore = parseFloat(barTarget(top.document).style.getPropertyValue("--mc-toolbar-offset"));
        vorab = {
          rowLeft: rectOf(row).left,
          leadExact: !!lead && lead == firstSpacer && Math.abs(rectOf(lead).right - (start + offsetBefore)) < 0.75,
        };
      }
      // Today-Pane gleitet ein: Der Einzug steht seit Beginn der Bewegung am Endmaß (gemessen, solange die Pane im
      // Fluss lag). Liegt sie über dem Inhalt, ist die Mailliste vorübergehend breiter, wenn sie mit offener Pane
      // schmaler wird (ESR, 1500 px: 667 statt 650 px) – wer jetzt nachmisst, schöbe alle Knöpfe um diese Differenz
      // nach rechts und am Ende zurück (Sprung um 17 px im ersten und im letzten Bild)
      const tpPanel = top.document.getElementById("today-pane-panel");
      const tpSlidingIn = !top.__mcDry && !!tpPanel?.__mcAnimating && tpPanel.__mcSliding == "in";
      if (!tpSlidingIn) {
        setBarVar(top.document, "--mc-toolbar-offset", `${offset}px`);
      }
      setVar(top.document.getElementById("unifiedToolbarContainer"), "--mc-row-tail", `${rowTail(top.document)}px`);
      if (!animating) {
        // passt, wenn die Knöpfe an der Listenkante beginnen und das Suchfeld
        // noch nicht ganz zur Lupe (40 px) geschrumpft ist – wie Apple Mail
        // wird zuerst die Suche schmaler, erst dann weichen Knöpfe
        const search = content.querySelector(':scope > li[item-id="search-bar"]');
        // Der Abstand nach „Verfassen“ (69 px) schrumpft vor allem anderen bis
        // auf 12 px, wird aber erst unten nachgeführt: was er noch hergeben
        // kann, zählt hier als Platz. Sonst wichen nach einem Sprung der
        // Breite (Start, Today-Pane, geöffnetes Suchfeld wieder zu) mehr
        // Pillen als nötig, der Abstand blieb dank des frei gewordenen Platzes
        // bei 69 px, und die Pillen kamen bei gleicher Fensterbreite nicht
        // zurück (GitHub #67)
        const writeLi = content.querySelector(':scope > li[item-id="write-message"]');
        const slack = writeLi && rectOf(writeLi).width
          ? Math.max(0, (parseFloat(top.getComputedStyle(writeLi).marginInlineEnd) || 0) - 12)
          : 0;
        squeezeToolbar(top.document, () => {
          const lack = searchLackOf(content, search);
          return lack <= slack && (!firstSpacer || rectOf(firstSpacer).right + slack - lack >= start + offset - 2);
        });
      }
      // Suchfeld in jedem Bereich gleich breit (333 px wie Apple Mail, bzw. so
      // breit wie sein Platzhalter): fehlt dafür Platz, wird zuerst der Abstand
      // nach „Verfassen“ kleiner (69 → 12 px)
      const write = content.querySelector(':scope > li[item-id="write-message"]');
      const search = content.querySelector(':scope > li[item-id="search-bar"]');
      // (nicht während einer Ein-/Ausblend-Animation – das kostet pro Bild ein
      // komplettes Neuberechnen; am Ende wird einmal gemessen)
      if (!animating && write && search && rectOf(write).width) {
        // Abstandhalter vor dem Suchfeld – der Überlauf-Knopf „»“ steht
        // dazwischen (auch ausgeblendet), ebenso ausgeblendete Einträge
        let spacer = search.previousElementSibling;
        while (spacer && spacer.getAttribute("item-id") != "spacer" &&
               (spacer.id == OVERFLOW_ID || spacer.hidden || !rectOf(spacer).width)) {
          spacer = spacer.previousElementSibling;
        }
        const gap = parseFloat(top.getComputedStyle(write).marginInlineEnd) || 0;
        // das Suchfeld wird höchstens so breit wie Lupe + Platzhalter
        // (max-width mit --mc-search-fit, z. B. 169 px bei „Search All
        // Mailboxes“) – fehlt ihm nur bis dahin Platz
        // (aus --mc-search-fit, nicht aus der berechneten max-width: die hält das
        // Feld auf der Lupe, solange Pillen weichen – der Abstand muss trotzdem
        // zuerst auf 12 px, sonst stand er bei 69 px und „Abrufen“ rutschte im
        // schmalsten Fenster über den Seitenleisten-Knopf)
        const searchMax = Math.min(333, parseFloat(search.style.getPropertyValue("--mc-search-fit")) || 333);
        const spare = (spacer?.getAttribute("item-id") == "spacer" ? rectOf(spacer).width : 0) -
          Math.max(0, searchMax - rectOf(search).width);
        const next = Math.max(12, Math.min(69, Math.round(gap + spare)));
        if (Math.abs(next - gap) >= 1) {
          setBarVar(top.document, "--mc-write-gap", `${next}px`);
        }
      } else if (animating && win.__mcGapRun && win.__mcFortschritt) {
        // Ein-/Ausblenden der Seitenleiste: der Abstand gleitet je Bild vom
        // Anfangs- zum vorab gerechneten Endwert (toggleSidebar) – sonst blieb
        // er bis zum Ende stehen, und alle Knöpfe rechts von „Verfassen“
        // sprangen dann um bis zu 57 px (12 → 69 px)
        const [a, b] = win.__mcGapRun;
        setBarVar(top.document, "--mc-write-gap", `${Math.round(a + (b - a) * win.__mcFortschritt())}px`);
      }
      // ebenso der Abstand vor der Mittelgruppe (Mail, siehe toggleSidebar)
      if (animating && win.__mcMidRun && win.__mcFortschritt) {
        const [a, b, l0, l1] = win.__mcMidRun;
        const p = Number.isFinite(l0) && Number.isFinite(l1) && Math.abs(l1 - l0) >= 1
          ? Math.min(1, Math.max(0, (offset - l0) / (l1 - l0)))
          : win.__mcFortschritt();
        setBarVar(top.document, "--mc-mid-gap", `${(a + (b - a) * p).toFixed(2)}px`);
      }
      // Rechte Kante der Ordnerliste relativ zur Toolbar-Zeile: damit färbt
      // userChrome.css die Seitenleiste bis ganz nach oben grau wie in Apple Mail.
      const folderPane = win.document.getElementById("folderPane");
      if (folderPane && row) {
        const fr = vorab ? folderRect : rectOf(folderPane);
        const right = fr.width
          ? (vorab ? browserLeft : rectOf(browserEl).left) + fr.right - (vorab ? vorab.rowLeft : rectOf(row).left)
          : 0;
        setBarVar(top.document, "--mc-sidebar-right", `${Math.max(0, Math.round(right))}px`
        );
        // rechte Kante der Mailliste für die Trennlinie in der Toolbar-Zeile
        // Ist das Fenster für alle Knöpfe zu schmal, schrumpft der Einzug davor –
        // die Kopfzeile über der Liste endet dann vor dem ersten Knopf
        const buttonsStart = vorab?.leadExact ? start + offset : firstSpacer ? rectOf(firstSpacer).right : paneRight;
        const rowLeft = vorab ? vorab.rowLeft : rectOf(row).left;
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
      } catch {} // gewollt: ohne Mailliste (z. B. Kontextmenü eines Ordners) gibt es keine gewählten Mails
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
        } catch {} // gewollt: Mail ohne lesbaren Faden, dann kein Teilfaden
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
}
