// Einstellungen von halo.spaces – liest und schreibt über die Erweiterung
// (browser.mailCards.getSettings/setSetting), Änderungen gelten sofort
"use strict";

const api = browser.mailCards;

// Texte aus der zentralen Tabelle der Erweiterung (getTranslations)
let TABLE = {};
const t = english => TABLE[english] ?? english;

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k == "class") node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

function savedBadge() {
  return el("span", { class: "saved", textContent: t("saved") });
}

function flash(badge) {
  badge.classList.add("show");
  setTimeout(() => badge.classList.remove("show"), 1200);
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Zeile bzw. Abschnitt sanft auf- oder zuklappen (Höhe und Deckkraft)
function slide(node, show) {
  if (show == !node.hidden) return;
  if (reduceMotion()) {
    node.hidden = !show;
    return;
  }
  node.getAnimations().forEach(a => a.cancel());
  node.hidden = false;
  const h = node.getBoundingClientRect().height;
  const frames = [{ height: "0px", opacity: 0, paddingBlock: "0px" }, { height: `${h}px`, opacity: 1 }];
  const anim = node.animate(show ? frames : frames.reverse(), { duration: 220, easing: "ease-out" });
  node.style.overflow = "hidden";
  anim.onfinish = () => {
    node.style.overflow = "";
    if (!show) node.hidden = true;
  };
}

let settings = {};
// Zeilen mit showIf: sichtbar nur, wenn die Option davor passt
const dependent = [];
function updateDependent(animate = true) {
  for (const { row, node } of dependent) {
    const [key, ...values] = row.showIf;
    const show = values.includes(settings[key]);
    if (animate) slide(node, show);
    else node.hidden = !show;
  }
}

// Vorschläge beim Tippen des Orts (wie in der Begrüßung)
function placeSuggestions(input, onPick) {
  const list = el("div", { class: "suggest", role: "listbox", hidden: true });
  let timer = null, seq = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 2) {
      list.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++seq;
      let hits = [];
      try {
        hits = await api.searchPlaces(text);
      } catch {}
      if (mine != seq) return;
      list.replaceChildren(...hits.map(p => {
        const b = el("button", { type: "button", role: "option", textContent: p.label });
        b.addEventListener("mousedown", e => e.preventDefault());
        b.addEventListener("click", () => {
          list.hidden = true;
          input.value = p.label;
          onPick(p);
        });
        return b;
      }));
      list.hidden = !hits.length;
    }, 250);
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  input.addEventListener("keydown", e => {
    if (e.key == "Escape") list.hidden = true;
  });
  return list;
}

async function render() {
  settings = await api.getSettings();
  const { lang, table } = await api.getTranslations();
  TABLE = table;
  document.documentElement.lang = lang;
  document.title = t("halo.spaces Settings");
  const main = document.getElementById("settings");
  main.replaceChildren();
  dependent.length = 0;
  // eingebettet als Kategorie in Thunderbirds Einstellungen: wie die übrigen
  // Kategorien – jeder Abschnitt mit großer Überschrift über seiner Karte
  // (wie „General“, „Language & Fonts“ …), links mit festem Abstand
  const inPrefs = new URLSearchParams(location.search).get("in") == "prefs";
  document.documentElement.classList.toggle("in-prefs", inPrefs);
  // Update liegt bereit: ganz oben eine Zeile mit „Install Now“
  const pending = await api.getPendingUpdate();
  if (pending) {
    const button = el("button", { type: "button", class: "accent", textContent: t("Install Now") });
    button.addEventListener("click", async () => {
      button.disabled = true;
      await api.installUpdateNow();
    });
    const text = el("span", { class: "text" },
      el("span", { class: "label", textContent: t("halo.spaces {version} is available").replace("{version}", pending.version) }),
      el("span", { class: "hint", textContent: pending.auto
        ? t("Or it installs on the next start. Thunderbird briefly shows its own look while updating.")
        : t("Automatic updates are off.") }));
    main.append(el("section", { class: "update", id: "s-update" }, el("div", { class: "row" }, text, button)));
  }
  for (const [title, rows, opts = {}] of SECTIONS(t)) {
    const section = el("section");
    for (const row of rows) {
      if ((row.mac && !settings.mac) || (row.notMac && settings.mac) || (row.needs && !settings[row.needs])) continue;
      const id = `s-${row.key}`;
      const badge = savedBadge();
      const label = el("span", { class: "label", textContent: row.label });
      const text = el("label", { class: "text", htmlFor: id }, label, badge, el("span", { class: "hint", textContent: row.hint || "" }));
      // Einzelheiten erst auf Nachfrage: ⓘ mit Tooltip
      if (row.info) {
        label.after(el("span", { class: "info", title: row.info, "aria-label": row.info, role: "img", textContent: "ⓘ" }));
      }
      const save = async value => {
        await api.setSetting(row.key, value);
        settings[row.key] = value;
        flash(badge);
        updateDependent();
      };
      let control;
      if (row.type == "chat") {
        // Chat an/aus; bei Aus erscheint darunter „Stattdessen“
        control = el("input", { id, type: "checkbox", class: "switch", checked: settings.fifthSpace == "chat", role: "switch" });
        control.addEventListener("change", async () => {
          const value = control.checked ? "chat" : "none";
          await api.setSetting("fifthSpace", value);
          settings.fifthSpace = value;
          const insteadSelect = document.getElementById("s-fifthSpace");
          if (insteadSelect) insteadSelect.value = value == "chat" ? "none" : value;
          flash(badge);
          updateDependent();
        });
      } else if (row.type == "select") {
        // feste Auswahl (options) oder Liste von der Erweiterung (choices: [{ value, label }])
        const list = row.choices ? settings[row.choices] || [] : row.options.map(o => ({ value: o,
          label: row.labels?.[o] ?? (row.unit ? `${o} ${row.unit}` : String(o)) }));
        control = el("select", { id }, ...list.map(o => el("option", { value: String(o.value), textContent: o.label })));
        if (row.choices && !list.length) {
          control.append(el("option", { value: "", textContent: t("No add-on with its own space installed"), disabled: true }));
        }
        control.value = String(settings[row.key]);
        if (control.selectedIndex < 0) control.selectedIndex = 0;
        // fünfter Bereich: Auswahl ohne passende Erweiterung nicht anbieten
        if (row.key == "fifthSpace" && !(settings.fifthSpaceAddons || []).length) {
          const opt = control.querySelector('option[value="addon"]');
          if (opt) {
            opt.disabled = true;
            opt.textContent += ` (${t("none installed")})`;
          }
        }
        const numeric = typeof (row.options || [])[0] == "number";
        control.addEventListener("change", () => save(numeric ? Number(control.value) : control.value));
      } else if (row.type == "place") {
        // Ort fürs Wetter: Vorschläge beim Tippen, darunter das Ergebnis (Ort und Temperatur bzw. Hinweis)
        const input = el("input", { id, type: "text", value: settings[row.key] || "", placeholder: row.placeholder || "", spellcheck: false, class: "place" });
        const status = el("span", { class: "hint status", textContent: settings.weatherStatus || "" });
        const refresh = async () => (status.textContent = (await api.getSettings()).weatherStatus || "");
        let timer = null;
        const list = placeSuggestions(input, async p => {
          clearTimeout(timer);
          await api.choosePlace(p);
          settings.weatherPlace = p.label;
          flash(badge);
          refresh();
        });
        input.addEventListener("input", () => {
          clearTimeout(timer);
          // leer: aktueller Standort; sonst erst nach einer Pause (Vorschläge haben Vorrang)
          timer = setTimeout(async () => {
            if (input.value.trim()) return;
            await save("");
            refresh();
          }, 800);
        });
        text.append(status);
        control = el("span", { class: "place-box" }, input, list);
      } else if (row.type == "url") {
        const input = el("input", { id, type: "url", value: settings[row.key] || "", placeholder: row.placeholder || "", spellcheck: false, class: "place" });
        const status = el("span", { class: "hint status" });
        let timer = null;
        input.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            try {
              await save(input.value.trim());
              status.textContent = "";
            } catch {
              status.textContent = t("Not a valid web address");
            }
          }, 800);
        });
        text.append(status);
        control = input;
      } else if (row.type == "textarea") {
        const area = el("textarea", { id, value: settings[row.key], placeholder: row.placeholder, spellcheck: false });
        let timer = null;
        area.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(() => save(area.value), 500);
        });
        const node = el("div", { class: "row block", id: `row-${row.key}` }, text, area);
        section.append(node);
        if (row.showIf) dependent.push({ row, node });
        continue;
      } else {
        control = el("input", { id, type: "checkbox", class: "switch", checked: !!settings[row.key], role: "switch" });
        control.addEventListener("change", () => save(control.checked));
      }
      const node = el("div", { class: "row", id: `row-${row.key}` }, text, control);
      section.append(node);
      if (row.showIf) dependent.push({ row, node });
    }
    if (opts.collapsed) {
      // eingeklappt: Überschrift als Knopf mit Pfeil
      const head = el("button", { type: "button", class: "disclosure", "aria-expanded": "false" }, title);
      section.hidden = true;
      head.addEventListener("click", () => {
        const open = head.getAttribute("aria-expanded") != "true";
        head.setAttribute("aria-expanded", String(open));
        slide(section, open);
      });
      main.append(el("h2", {}, head), section);
    } else {
      main.append(el("h2", { textContent: title }), section);
    }
  }
  updateDependent(false);
}

// Treffer aus der Suche der Einstellungen (#s-<key>): Option zeigen und kurz hervorheben
function showFound() {
  const row = document.getElementById(`row-${location.hash.slice(3)}`);
  if (!location.hash.startsWith("#s-") || !row) return;
  // eingeklappter Abschnitt bzw. ausgeblendete Zeile: aufklappen
  const section = row.closest("section");
  if (section?.hidden) {
    section.hidden = false;
    section.previousElementSibling?.querySelector(".disclosure")?.setAttribute("aria-expanded", "true");
  }
  row.hidden = false;
  row.scrollIntoView({ block: "center" });
  row.classList.remove("found");
  row.offsetWidth; // Hervorhebung neu starten
  row.classList.add("found");
}
window.addEventListener("hashchange", showFound);

render().then(showFound);
