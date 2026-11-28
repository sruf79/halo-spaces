/* Teil von implementation.js (Experiment-API mailCards), geladen mit
 * loadPart("suchvorschlag.js"); läuft in derselben Umgebung, alle Namen von dort
 * (Services, MailServices, tr, log …) gelten hier wie eigene.
 *
 * Mail-Suche: Vorschlagsmenü unter dem Suchfeld oben zum Eingrenzen der Suche
 * (Personen, „Subject contains“, „Message contains“, frühere Suchen) und die
 * gewählten Eingrenzungen als graue Kapseln im Feld. Reine Hilfen stehen oben
 * (searchSuggestRows, searchRecentAdd, searchFilterSpecs, searchCapText), die
 * Oberfläche in der Klasse EnhancerSuchvorschlag; implementation.js übernimmt
 * deren Methoden auf CardEnhancer.prototype.
 */

"use strict";

// frühere Suchen (nur lokal, die letzten zehn)
const SEARCH_RECENT_PREF = "extensions.mailcards.searchRecent";
const SEARCH_RECENT_MAX = 10;
// Zeilen im Vorschlagsmenü
const SEARCH_SUGGEST_MAX = 8;
const SEARCH_SUGGEST_PERSONS = 3;
// Eingrenzungen: Bezeichnung in der Kapsel und Suchfeld von Thunderbird
// (nsMsgSearchAttrib); Personen je nach Wahl From / To / Any
const SEARCH_FILTER_KINDS = {
  subject: { label: "Subject", attrib: "Subject" },
  body: { label: "Message", attrib: "Body" },
};
const SEARCH_PERSON_FIELDS = {
  from: { label: "From", attrib: "Sender" },
  to: { label: "To", attrib: "ToOrCC" },
  any: { label: "Any", attrib: "AllAddresses" },
};

// Zeilen des Vorschlagsmenüs zum getippten Text: zuerst Personen (jede
// Adresse nur einmal, eine Zeile je Name – dieselbe Person mit mehreren
// Adressen, aus mehreren Adressbüchern oder gesammelten Adressen erscheint
// nur einmal –, höchstens drei, nur der Name), dann „Subject contains“
// und „Message contains“, zuletzt frühere Suchen, die den Text enthalten
function searchSuggestRows(text, persons = [], recent = [], max = SEARCH_SUGGEST_MAX) {
  const term = (text || "").trim();
  if (!term) {
    return [];
  }
  const rows = [];
  const seen = new Set();
  const byName = new Map();
  for (const p of persons || []) {
    const address = (p?.address || "").trim();
    const key = address.toLowerCase();
    if (!address.includes("@") || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const name = (p.name || "").trim();
    const same = name && byName.get(name.toLowerCase());
    if (same) {
      same.addresses.push(address);
      continue;
    }
    if (rows.length >= SEARCH_SUGGEST_PERSONS) {
      continue; // (weitere Adressen schon gezeigter Personen zählen noch)
    }
    const row = { kind: "person", value: address, name: name || address, addresses: [address] };
    rows.push(row);
    if (name) {
      byName.set(name.toLowerCase(), row);
    }
  }
  rows.push({ kind: "subject", value: term });
  rows.push({ kind: "body", value: term });
  const lower = term.toLowerCase();
  for (const old of recent || []) {
    if (rows.length >= max) {
      break;
    }
    const o = (old || "").trim();
    if (o && o.toLowerCase() != lower && o.toLowerCase().includes(lower) && !rows.some(r => r.kind == "recent" && r.value == o)) {
      rows.push({ kind: "recent", value: o });
    }
  }
  return rows.slice(0, max);
}

// frühere Suchen: neueste zuerst, jede nur einmal (ohne Groß-/Kleinschreibung)
function searchRecentAdd(list, text, max = SEARCH_RECENT_MAX) {
  const term = (text || "").trim();
  const rest = (Array.isArray(list) ? list : []).filter(t => typeof t == "string" && t.trim());
  if (term.length < 2) {
    return rest.slice(0, max);
  }
  return [term, ...rest.filter(t => t.toLowerCase() != term.toLowerCase())].slice(0, max);
}

// Eingrenzungen als Suchbedingungen: Name des Suchfelds (nsMsgSearchAttrib)
// und Wert; Unbekanntes und Leeres fällt weg
function searchFilterSpecs(filters) {
  const specs = [];
  for (const f of filters || []) {
    // eine Person mit mehreren Adressen: nach dem Namen suchen (Thunderbird
    // vergleicht bei From/To/Any Name und Adresse); eine ODER-Gruppe der
    // Adressen ginge nicht, Suchordner speichern die Bedingungen ohne Klammern
    const several = f?.kind == "person" && Array.isArray(f.addresses) && f.addresses.length > 1 && (f.name || "").trim();
    const value = (several || f?.value || "").trim();
    const attrib = f?.kind == "person" ? (SEARCH_PERSON_FIELDS[f.field] || SEARCH_PERSON_FIELDS.from).attrib
      : SEARCH_FILTER_KINDS[f?.kind]?.attrib;
    if (value && attrib) {
      specs.push({ attrib, value });
    }
  }
  return specs;
}

// Kapsel im Feld: Bezeichnung (grau) und Begriff, z. B. „Subject“ + „rechnung“,
// bei einer Person „From“ + Name
function searchCapText(filter) {
  if (filter?.kind == "person") {
    return { label: (SEARCH_PERSON_FIELDS[filter.field] || SEARCH_PERSON_FIELDS.from).label, value: filter.name || filter.value || "" };
  }
  return { label: SEARCH_FILTER_KINDS[filter?.kind]?.label || "", value: filter?.value || "" };
}

class EnhancerSuchvorschlag {
  searchRecentList() {
    try {
      const list = JSON.parse(Services.prefs.getStringPref(SEARCH_RECENT_PREF, "[]"));
      return Array.isArray(list) ? list.filter(t => typeof t == "string") : [];
    } catch {
      return []; // gewollt: unlesbare Einstellung zählt als leer
    }
  }

  rememberSearch(text) {
    const before = this.searchRecentList();
    const list = searchRecentAdd(before, text);
    if (JSON.stringify(list) != JSON.stringify(before)) {
      Services.prefs.setStringPref(SEARCH_RECENT_PREF, JSON.stringify(list));
    }
  }

  // Personen aus Adressbüchern und gesammelten Adressen (dieselbe Suche wie
  // die Empfänger-Vorschläge beim Verfassen); antwortet spätestens nach 400 ms
  searchPersons(text) {
    return new Promise(resolve => {
      const found = [];
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(found);
        }
      };
      const timer = setTimeout(finish, 400);
      try {
        const search = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].createInstance(Ci.nsIAutoCompleteSearch);
        search.startSearch(text, "{}", null, {
          onSearchResult(s, result) {
            for (let i = 0; i < result.matchCount; i++) {
              for (const a of MailServices.headerParser.makeFromDisplayAddress(result.getValueAt(i))) {
                if (a.email?.includes("@")) {
                  found.push({ name: a.name || "", address: a.email });
                }
              }
            }
            if (result.searchResult != Ci.nsIAutoCompleteResult.RESULT_NOMATCH_ONGOING &&
                result.searchResult != Ci.nsIAutoCompleteResult.RESULT_SUCCESS_ONGOING) {
              finish();
            }
          },
        });
      } catch (e) {
        log("search persons error", e);
        finish();
      }
    });
  }

  // Eingrenzungen der Mail-Suche setzen: Kapseln neu zeichnen und mit dem
  // Text im Feld neu suchen
  setSearchFilters(w, filters, text) {
    this.mailSearchFilters = filters;
    this.renderSearchCaps(w);
    w.clearTimeout(w.__mcMailSearchTimer);
    this.mailSearch(w, text ?? this.searchFieldInput(w)?.value ?? "");
    w.__mcSearchPlaceholder?.();
  }

  searchFieldBar(w) {
    return w.document.querySelector("#unifiedToolbarContent global-search-bar");
  }

  searchFieldInput(w) {
    return this.searchFieldBar(w)?.shadowRoot?.querySelector("input") || null;
  }

  // Kapseln der Eingrenzungen vor dem Text im Suchfeld (Shadow-DOM des
  // Felds); nur im Mail-Space sichtbar, in anderen Bereichen ruht die Suche
  renderSearchCaps(w) {
    const bar = this.searchFieldBar(w);
    const root = bar?.shadowRoot;
    if (!root) {
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    const d = w.document;
    const filters = w.__mcSearchMode == "mail3PaneTab" ? this.mailSearchFilters || [] : [];
    // unverändert: nichts anfassen (läuft auch im Sekundentakt von markTab)
    const sig = JSON.stringify(filters);
    let box = root.getElementById("mc-caps");
    if (box && bar.__mcCapsSig == sig) {
      return;
    }
    bar.__mcCapsSig = sig;
    if (!box) {
      if (!filters.length) {
        return;
      }
      const style = d.createElementNS(X, "style");
      style.id = "mc-caps-style";
      style.textContent = `
        #mc-caps { position: absolute; inset-block: 0; inset-inline-start: 28px; max-inline-size: calc(100% - 28px - 70px);
          display: flex; align-items: center; gap: 4px; overflow: hidden; z-index: 1; }
        #mc-caps:empty { display: none; }
        .mc-cap { display: inline-flex; align-items: center; gap: 4px; flex: 0 1 auto; min-inline-size: 0; box-sizing: border-box;
          block-size: 20px; padding-inline: 8px; border-radius: 10px; background-color: var(--mt-cap-press);
          font-size: calc(12px * var(--mt-font-scale, 1)); line-height: 20px; white-space: nowrap; cursor: default; }
        .mc-cap-k { color: var(--mt-text-secondary); flex: none; }
        .mc-cap-v { color: var(--mt-text); overflow: hidden; text-overflow: ellipsis; max-inline-size: 150px; }
        #mc-caps-clear { position: absolute; inset-block: 0; inset-inline-end: 4px; inline-size: 22px; block-size: 22px; margin-block: auto;
          display: none; z-index: 1; background: var(--icon-close) center / 16px no-repeat; -moz-context-properties: fill, stroke;
          fill: color-mix(in srgb, currentColor 20%, transparent); stroke: currentColor; }
        :host([mc-caps]) #mc-caps-clear { display: block; }
        :host([mc-caps]) input { padding-inline-start: calc(32px + var(--mc-caps-w, 0px)) !important; padding-inline-end: 28px !important; }
        :host([mc-caps]) input::-moz-search-clear-button { display: none; }
        :host([mc-caps]) div { display: none !important; }
      `;
      box = d.createElementNS(X, "span");
      box.id = "mc-caps";
      const clear = d.createElementNS(X, "span");
      clear.id = "mc-caps-clear";
      clear.setAttribute("role", "button");
      clear.setAttribute("aria-label", tr("Clear Search"));
      // × des Felds: Text und Eingrenzungen weg
      clear.addEventListener("click", () => {
        const input = this.searchFieldInput(w);
        if (input) {
          input.value = "";
        }
        this.closeSearchSuggest(w);
        this.setSearchFilters(w, [], "");
        input?.focus();
      });
      // Klick auf eine Kapsel: kleines Menü zum Wechseln des Bereichs
      box.addEventListener("mousedown", e => e.preventDefault());
      box.addEventListener("click", e => {
        const cap = e.target.closest?.(".mc-cap");
        if (cap) {
          this.openSearchCapMenu(w, cap, Number(cap.dataset.i));
        }
      });
      const form = root.querySelector("form") || root;
      form.append(box, clear);
      root.append(style);
      this.restorers.push(() => {
        box.remove();
        clear.remove();
        style.remove();
        bar.removeAttribute("mc-caps");
        bar.style.removeProperty("--mc-caps-w");
        delete bar.__mcCapsWidth;
        delete bar.__mcCapsSig;
        bar.__mcFit?.();
      });
    }
    box.replaceChildren(...filters.map((f, i) => {
      const { label, value } = searchCapText(f);
      const cap = d.createElementNS(X, "span");
      cap.className = "mc-cap";
      cap.dataset.i = i;
      cap.dataset.kind = f.kind;
      cap.setAttribute("role", "button");
      const k = d.createElementNS(X, "span");
      k.className = "mc-cap-k";
      k.textContent = tr(label);
      const v = d.createElementNS(X, "span");
      v.className = "mc-cap-v";
      v.textContent = value;
      cap.append(k, v);
      return cap;
    }));
    bar.toggleAttribute("mc-caps", filters.length > 0);
    // erst mit voller Feldbreite messen (bar.__mcFit, styleSearch), sonst
    // misst man die im schmalen Feld gestauchten Kapseln
    const natural = [...box.children].reduce((sum, c) => sum + c.scrollWidth + 16 + 4, 0);
    bar.__mcCapsWidth = filters.length ? natural : 0;
    bar.__mcFit?.();
    const width = filters.length ? Math.ceil(box.getBoundingClientRect().width) : 0;
    bar.style.setProperty("--mc-caps-w", `${width}px`);
  }

  openSearchCapMenu(w, cap, index) {
    const d = w.document;
    const filter = (this.mailSearchFilters || [])[index];
    if (!filter) {
      return;
    }
    let popup = d.getElementById("mcSearchCapMenu");
    if (!popup) {
      popup = d.createXULElement("menupopup");
      popup.id = "mcSearchCapMenu";
      (d.getElementById("mainPopupSet") || d.documentElement).append(popup);
      this.restorers.push(() => popup.remove());
    }
    const choices = filter.kind == "person"
      ? Object.entries(SEARCH_PERSON_FIELDS).map(([key, v]) => ({ key, label: v.label, on: (filter.field || "from") == key, set: { field: key } }))
      : Object.entries(SEARCH_FILTER_KINDS).map(([key, v]) => ({ key, label: v.label, on: filter.kind == key, set: { kind: key } }));
    popup.replaceChildren(...choices.map(c => {
      const item = d.createXULElement("menuitem");
      item.setAttribute("label", tr(c.label));
      item.setAttribute("type", "radio");
      item.setAttribute("name", "mcSearchCap");
      item.setAttribute("value", c.key);
      if (c.on) {
        item.setAttribute("checked", "true");
      }
      item.addEventListener("command", () => {
        const filters = [...(this.mailSearchFilters || [])];
        if (filters[index] === filter) {
          filters[index] = { ...filter, ...c.set };
          this.setSearchFilters(w, filters);
        }
      });
      return item;
    }));
    popup.openPopup(cap, "after_start", 0, 4);
  }

  closeSearchSuggest(w) {
    const st = w.__mcSearchSuggest;
    if (st) {
      st.rows = [];
      st.index = -1;
      st.token++;
      st.reopen = false;
      if (st.panel.state != "closed") {
        st.closing = true;
        st.panel.hidePopup();
      }
    }
  }

  // Vorschlagsmenü unter dem Suchfeld (nur im Mail-Space): gebaut wie die
  // übrigen Menüs, der Fokus bleibt im Feld, ↓ ↑ wählen, ↩ übernimmt, ⎋ schließt
  hookSearchSuggest(w) {
    const d = w.document;
    const bar = this.searchFieldBar(w);
    if (!bar?.shadowRoot || w.__mcSearchSuggest) {
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    const panel = d.createXULElement("panel");
    panel.id = "mcSearchSuggest";
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("consumeoutsideclicks", "false");
    panel.setAttribute("role", "listbox");
    const list = d.createElementNS(X, "div");
    list.className = "mc-sg-list";
    panel.append(list);
    (d.getElementById("mainPopupSet") || d.documentElement).append(panel);
    const st = (w.__mcSearchSuggest = { panel, rows: [], index: -1, token: 0 });
    const inMail = () => w.__mcSearchMode == "mail3PaneTab";
    const input = () => bar.shadowRoot.querySelector("input");
    const ICONS = { person: "user", subject: "mail", body: "file", recent: "search" };
    const LABELS = { subject: "Subject contains:", body: "Message contains:" };

    const select = index => {
      st.index = index;
      [...list.children].forEach((row, i) => row.toggleAttribute("selected", i == index));
    };
    const draw = () => {
      list.replaceChildren(...st.rows.map((r, i) => {
        const row = d.createElementNS(X, "div");
        row.className = "mc-sg-row";
        row.dataset.kind = r.kind;
        row.dataset.i = i;
        row.setAttribute("role", "option");
        const icon = d.createElementNS(X, "img");
        icon.className = "mc-sg-icon";
        icon.src = `resource://mailcards/icons/${ICONS[r.kind]}.svg`;
        icon.alt = "";
        row.append(icon);
        const label = d.createElementNS(X, "span");
        label.className = "mc-sg-label";
        if (LABELS[r.kind]) {
          label.textContent = tr(LABELS[r.kind]);
          const term = d.createElementNS(X, "span");
          term.className = "mc-sg-term";
          term.textContent = r.value;
          row.append(label, term);
        } else {
          label.textContent = r.kind == "person" ? r.name : r.value;
          row.append(label);
        }
        return row;
      }));
      select(-1);
    };
    const place = () => {
      // mindestens so breit wie das Suchfeld in voller Breite (333 px),
      // höchstens bis 8 px vor den Fensterrand, bündig mit dem Feldende
      const f = bar.getBoundingClientRect();
      const rtl = w.getComputedStyle(bar).direction == "rtl";
      const room = (rtl ? w.innerWidth - f.left : f.right) - 8;
      panel.style.setProperty("--mc-suggest-width", `${Math.floor(Math.max(f.width, Math.min(333, room)))}px`);
    };
    const show = rows => {
      st.rows = rows;
      // nur nach eigenem Schließen wieder öffnen, nicht nach einem Klick daneben
      st.reopen = rows.length > 0 && panel.state == "hiding" && st.closing;
      draw();
      if (!rows.length) {
        if (panel.state != "closed") {
          st.closing = true;
          panel.hidePopup();
        }
        return;
      }
      place();
      // (schließt es gerade noch, öffnet onHidden es wieder)
      if (panel.state == "closed") {
        panel.openPopup(bar, "after_end", 0, 4);
      }
    };
    const update = () => {
      const token = ++st.token;
      const text = input()?.value || "";
      if (!inMail() || !text.trim()) {
        show([]);
        return;
      }
      const recent = this.searchRecentList();
      // sofort ohne Personen, die Adressbuchsuche ergänzt gleich
      if (!st.rows.length) {
        show(searchSuggestRows(text, [], recent));
      }
      this.searchPersons(text.trim()).then(persons => {
        if (token == st.token) {
          const index = st.index;
          const before = st.rows[index];
          show(searchSuggestRows(text, persons, recent));
          // gewählte Zeile behalten, wenn es sie noch gibt
          const again = before ? st.rows.findIndex(r => r.kind == before.kind && r.value == before.value) : -1;
          select(again);
        }
      });
    };
    const apply = row => {
      const field = input();
      this.closeSearchSuggest(w);
      if (!row || !field) {
        return;
      }
      if (row.kind == "recent") {
        field.value = row.value;
        this.rememberSearch(row.value);
        this.setSearchFilters(w, this.mailSearchFilters || [], row.value);
        return;
      }
      const filter = row.kind == "person" ? { kind: "person", field: "from", value: row.value, name: row.name, addresses: row.addresses } : { kind: row.kind, value: row.value };
      field.value = "";
      this.setSearchFilters(w, [...(this.mailSearchFilters || []), filter], "");
    };
    st.apply = apply;

    const onInput = () => update();
    const onKey = e => {
      if (!inMail() || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const open = st.rows.length > 0;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (open && (e.key == "ArrowDown" || e.key == "ArrowUp")) {
        const n = st.rows.length;
        // (nach der letzten Zeile wieder keine Wahl: ↩ sucht dann normal)
        const next = e.key == "ArrowDown" ? (st.index + 2) % (n + 1) - 1 : (st.index + n + 1) % (n + 1) - 1;
        select(next);
        stop();
      } else if (e.key == "Enter") {
        if (open && st.index >= 0) {
          apply(st.rows[st.index]);
          stop();
        } else {
          this.closeSearchSuggest(w);
        }
      } else if (e.key == "Escape") {
        if (open) {
          this.closeSearchSuggest(w);
          stop();
        } else if (!input()?.value && this.mailSearchFilters?.length) {
          this.setSearchFilters(w, [], "");
          stop();
        }
      } else if (e.key == "Backspace" && this.mailSearchFilters?.length) {
        const field = input();
        if (field && field.selectionStart == 0 && field.selectionEnd == 0) {
          this.setSearchFilters(w, this.mailSearchFilters.slice(0, -1));
          stop();
        }
      }
    };
    const onBlur = () => this.closeSearchSuggest(w);
    const onDown = e => e.preventDefault(); // Fokus bleibt im Feld
    const onClick = e => {
      const row = e.target.closest?.(".mc-sg-row");
      if (row) {
        apply(st.rows[Number(row.dataset.i)]);
      }
    };
    // „popuphidden“ kommt verzögert: inzwischen kann schon wieder getippt
    // sein (neue Zeilen) – dann gilt das Menü weiter bzw. öffnet wieder
    const onHidden = e => {
      if (e.target != panel || panel.state == "showing" || panel.state == "open") {
        return;
      }
      if (st.rows.length && st.reopen) {
        st.reopen = false;
        place();
        panel.openPopup(bar, "after_end", 0, 4);
        return;
      }
      st.rows = [];
      st.index = -1;
    };
    const onShown = e => {
      if (e.target == panel) {
        st.closing = false;
      }
    };
    bar.addEventListener("input", onInput);
    bar.addEventListener("keydown", onKey, true);
    bar.addEventListener("blur", onBlur);
    list.addEventListener("mousedown", onDown);
    list.addEventListener("click", onClick);
    panel.addEventListener("popuphidden", onHidden);
    panel.addEventListener("popupshown", onShown);
    this.restorers.push(() => {
      bar.removeEventListener("input", onInput);
      bar.removeEventListener("keydown", onKey, true);
      bar.removeEventListener("blur", onBlur);
      panel.remove();
      delete w.__mcSearchSuggest;
    });
  }
}
