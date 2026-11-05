// Messung je Oberfläche für den Design-Rundgang (tests/ui_tour.py --messung, Vergleich
// tests/rundgang_vergleich.py): Popups/Panels (Fläche, Zeilen, Trennlinien), Dialoge und
// Fenster (Hintergrund, Schrift, Knöpfe, Felder, Gruppen), Herkunft der Symbole
// (halo/original/data) und Suchfelder in Ruhe gegen :hover (Suchfelder haben laut
// AGENTS.md keinen Hover-Zustand). Läuft vor der Aufnahme; ändert nichts dauerhaft.
// Im Hauptfenster stehen popup und cur bereit, in Nebenfenstern w und d.
const P = {};
const cs = (e, p) => e ? e.ownerDocument.defaultView.getComputedStyle(e, p) : null;
const px = v => Math.round(parseFloat(v) * 10) / 10;
const isVis = el => !!el && el.getClientRects && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
const acc = (doc) => { try { const t = doc.createElement("div"); t.style.cssText = "position:fixed;left:-99px;width:1px;height:1px;background:AccentColor"; (doc.body || doc.documentElement).appendChild(t); const v = cs(t).backgroundColor; t.remove(); return v; } catch (e) { return null; } };
const iconSrc = el => { const s = cs(el); let u = s.listStyleImage; if (!u || u == "none") u = s.backgroundImage; if ((!u || u == "none") && el.localName == "img") u = el.src; if (!u || u == "none" || !/url\(|:\/\//.test(u)) return null; const m = /url\("?([^")]+)"?\)/.exec(u); const r = m ? m[1] : u; return /\.x?html(#|$)/.test(r) ? null : r; };
const iconsIn = (root) => { const out = {}; const all = [...root.querySelectorAll("toolbarbutton, button, menuitem, menu, .toolbarbutton-icon, .menu-icon, .menu-iconic-icon, img, image, .button-icon, [class*=icon]")].filter(isVis).slice(0, 400);
  for (const el of all) { let u = iconSrc(el); if (!u) for (const k of el.children) { u = iconSrc(k); if (u) break; } if (!u) continue; const src = /mailcards|moz-extension|resource:\/\/mailcards/.test(u) ? "halo" : /^data:/.test(u) ? "data" : /chrome:\/\/|resource:\/\//.test(u) ? "original" : "andere"; const key = src + " " + u.replace(/^data:.{0,40}.*/, "data:…").slice(0, 120); out[key] = (out[key] || 0) + 1; } return out; };
const btn = (b, accent) => { const s = cs(b); const r = b.getBoundingClientRect(); return { label: (b.label || b.getAttribute("label") || b.textContent || "").trim().slice(0, 24), h: Math.round(r.height), radius: s.borderTopLeftRadius, bg: s.backgroundColor, border: s.borderTopWidth + " " + s.borderTopColor, dflt: b.hasAttribute("default") || b.getAttribute("dlgtype") == "accept" || b.classList.contains("primary"), accent: !!accent && s.backgroundColor == accent, x: Math.round(r.left) }; };
const buttonsIn = (doc, accent) => { const roots = [doc]; for (const el of doc.querySelectorAll("dialog, *")) { if (el.shadowRoot) roots.push(el.shadowRoot); if (roots.length > 60) break; }
  const bs = []; for (const r of roots) for (const b of r.querySelectorAll("button")) if (isVis(b) && !b.closest("toolbar, menupopup, panel, .toolbar")) bs.push(btn(b, accent)); return bs.slice(0, 20); };
const inputsIn = doc => [...doc.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), menulist, textarea, select")].filter(isVis).slice(0, 8).map(e => { const s = cs(e); return { tag: e.localName + (e.type ? ":" + e.type : ""), h: Math.round(e.getBoundingClientRect().height), radius: s.borderTopLeftRadius, border: s.borderTopWidth + " " + s.borderTopStyle + " " + s.borderTopColor, bg: s.backgroundColor }; });
const groupsIn = doc => [...doc.querySelectorAll("groupbox, fieldset, .groupbox")].filter(isVis).slice(0, 5).map(e => { const s = cs(e); return { tag: e.localName, border: s.borderTopWidth + " " + s.borderTopStyle + " " + s.borderTopColor, radius: s.borderTopLeftRadius, bg: s.backgroundColor }; });
const popM = p => { const sr = p.shadowRoot; const c = sr && (sr.querySelector("[part~=content]") || sr.querySelector(".panel-arrowcontent, .menupopup-arrowscrollbox, slot")?.parentElement) || p; const s = cs(c), ps = cs(p);
  const items = [...p.querySelectorAll(":scope > menuitem, :scope > menu, menuitem, menu")].filter(isVis); const it = items[0]; const sep = [...p.querySelectorAll("menuseparator")].find(isVis);
  const val = (a, b) => (a && a != "none" && a != "rgba(0, 0, 0, 0)" && a != "0px") ? a : b;
  return { tag: p.localName, radius: val(s.borderTopLeftRadius, ps.borderTopLeftRadius), bg: val(s.backgroundColor, ps.backgroundColor), shadow: val(s.boxShadow, ps.boxShadow).slice(0, 80), border: val(s.borderTopWidth + " " + s.borderTopColor, ps.borderTopWidth + " " + ps.borderTopColor), padding: s.padding || ps.padding,
    itemH: it ? Math.round(it.getBoundingClientRect().height) : null, itemFont: it ? cs(it).fontSize : null, itemPad: it ? cs(it).paddingInlineStart : null, items: items.length,
    sep: sep ? { color: cs(sep).borderTopColor + "/" + cs(sep).backgroundColor, margin: cs(sep).marginBlockStart + " " + cs(sep).marginInlineStart, h: Math.round(sep.getBoundingClientRect().height) } : null,
    check: !!p.querySelector("menuitem[type=checkbox], menuitem[type=radio], menuitem[checked]"), arrow: !!p.querySelector(":scope > menu, menu"), w: Math.round(p.getBoundingClientRect().width) }; };
let pp = (typeof popup != "undefined" && popup) ? popup : null;
if (pp) { P.kind = "popup"; P.popup = popM(pp); P.icons = iconsIn(pp); }
else {
  let doc = (typeof cur != "undefined" && cur) ? cur : document;
  // offene Unterdialoge (Einstellungen u. a.) bevorzugen
  const docs = [doc, (typeof d != "undefined" ? d : null)].filter(Boolean);
  let sub = null; for (const dd of docs) { const f = [...dd.querySelectorAll(".dialogFrame, browser.dialogFrame")].filter(isVis).pop(); if (f && f.contentDocument) sub = f.contentDocument; }
  if (sub) { doc = sub; P.sub = sub.location.href.split("/").pop(); }
  const a = acc(doc); P.kind = "doc"; P.url = doc.location?.href?.slice(0, 80); P.accent = a;
  const root = doc.documentElement, body = doc.body || root; P.bg = cs(root).backgroundColor + " / " + cs(body).backgroundColor; P.font = cs(body).fontSize + " " + cs(body).fontFamily.split(",")[0];
  P.buttons = buttonsIn(doc, a); P.inputs = inputsIn(doc); P.groups = groupsIn(doc); P.icons = iconsIn(doc);
  try { if (typeof tm != "undefined" && tm.currentAbout3Pane && !sub) P.paneIcons = iconsIn(tm.currentAbout3Pane.document); } catch (e) {}
  if (typeof d != "undefined" && d && doc !== d && !sub) P.mainIcons = iconsIn(d.getElementById("unifiedToolbar") || d.getElementById("navigation-toolbox") || d);
}
// Suchfelder: Feld und Lupe in Ruhe und mit gesperrtem :hover messen
const suchfelder = doc => {
  const roots = [doc]; for (const el of doc.querySelectorAll("*")) { if (el.shadowRoot) roots.push(el.shadowRoot); if (roots.length > 80) break; }
  const felder = [];
  for (const r of roots) for (const el of r.querySelectorAll("input[type=search], search-bar, global-search-bar, #searchInput, .search-input, input.searchBox, [is=search-textbox]"))
    if (isVis(el) && !felder.some(f => f === el || f.contains?.(el) || el.getRootNode?.().host === f)) felder.push(el);
  const iu = typeof InspectorUtils != "undefined" ? InspectorUtils : null;
  // völlig durchsichtige Farben gleich schreiben (rgba(0, 0, 0, 0) und color(srgb 0 0 0 / 0) sind dasselbe)
  const farbe = v => /^(rgba\(.*, 0\)|color\(.* \/ 0\)|transparent)$/.test(v) ? "transparent" : v;
  const stil = (e, p) => { const s = cs(e, p); return s ? [farbe(s.backgroundColor), farbe(s.borderTopColor), s.borderTopWidth, s.boxShadow, s.opacity, farbe(s.fill), s.backgroundImage.slice(0, 60), s.outlineStyle].join(" | ") : null; };
  return felder.slice(0, 6).map(f => {
    const sr = f.shadowRoot;
    const lupe = (sr || f).querySelector?.(".search-icon, [part~=icon], .button-icon, button, img") || null;
    // bei Elementen mit Shadow-DOM (global-search-bar, search-bar) zeichnet das innere Feld die Kapsel
    const innen = sr ? sr.querySelector("input") : null;
    const feld = innen && cs(innen.parentElement).borderTopLeftRadius != "0px" ? innen.parentElement : (innen || f);
    const teile = [[f, null], [f, "::before"], [feld !== f ? feld : null, null], [lupe, null]].filter(([e]) => e);
    const ruhe = teile.map(([e, p]) => stil(e, p));
    let hover = null;
    if (iu) {
      try {
        for (const [e] of teile) iu.addPseudoClassLock(e, ":hover", true);
        hover = teile.map(([e, p]) => stil(e, p));
      } finally {
        for (const [e] of teile) try { iu.removePseudoClassLock(e, ":hover"); } catch (e2) {}
      }
    }
    const s = cs(feld);
    return { name: (f.id || f.localName) + (f.getAttribute("placeholder") ? " " + f.getAttribute("placeholder").slice(0, 20) : ""),
      radius: s.borderTopLeftRadius, h: Math.round(f.getBoundingClientRect().height), lupe: lupe ? lupe.localName + "." + [...lupe.classList].join(".") : null,
      hoverGleich: hover ? JSON.stringify(ruhe) == JSON.stringify(hover) : null, ruhe, hover };
  });
};
if (P.kind != "popup") try {
  const sd = (typeof cur != "undefined" && cur) ? cur : (typeof d != "undefined" ? d : document);
  const sf = [...suchfelder(sd)];
  if (typeof tm != "undefined" && tm.currentAbout3Pane && sd !== tm.currentAbout3Pane.document) sf.push(...suchfelder(tm.currentAbout3Pane.document));
  if (typeof d != "undefined" && d && d !== sd) sf.push(...suchfelder(d));
  if (sf.length) P.suchfelder = sf.slice(0, 8);
} catch (e) { P.suchfelderFehler = String(e).slice(0, 120); }
return P;
