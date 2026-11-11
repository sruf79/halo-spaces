"""Gemeinsame Hilfen für die Sprungmessung (sprung_messung.py) und die Prüfung in halo_test.py (ohne Import von halo_test).

Messfühler im Chrome-Kontext: zeichnet mit jedem Bildwechsel die Lage aller Knöpfe und Trennlinien der oberen Zeilen
(Hauptfenster und eingebettetes Dokument), der Ampel-Fläche (.titlebar-buttonbox) und der Seitenleiste auf.
"""

SAMPLER = r"""
w.__mcSpr = w.__mcSpr || {};
const S = w.__mcSpr;
S.kern = (modus) => {
  if (modus == "mail") return tm.tabInfo[0]?.chromeBrowser?.contentWindow?.document.getElementById("folderPane");
  if (modus == "addressbook") return tm.currentTabInfo?.browser?.contentDocument?.getElementById("booksPane");
  if (modus == "settings") return tm.currentTabInfo?.browser?.contentDocument?.getElementById("pref-category-box");
  if (modus == "chat") return d.getElementById("listPaneBox");
  return d.getElementById("calSidebar");
};
// Elemente der oberen Zeilen einmal einsammeln (Knöpfe, Trennlinien, Ampel-Fläche), mit Versatz des Dokuments
S.sammle = (modus) => {
  const list = [];
  const add = (doc, prefix, ox, oy, sel, maxY) => {
    const seen = new Set();
    doc.querySelectorAll(sel).forEach((el, i) => {
      if (seen.has(el)) return; seen.add(el);
      const r = el.getBoundingClientRect();
      if (!r.width || r.top > maxY) return;
      const key = prefix + ":" + (el.id ? "#" + el.id : el.getAttribute("item-id") ? "[" + el.getAttribute("item-id") + "]" : el.localName + "." + String(el.className || "").split(" ").filter(Boolean).slice(0, 2).join(".")) + "@" + i;
      list.push({ key, el, ox, oy });
    });
  };
  const SEL = "button, toolbarbutton, radio, hr, toolbarseparator, [role=separator], li[item-id], .titlebar-buttonbox-container, .titlebar-buttonbox, #spacesPinnedButton, #mcTodayToggle, search-bar, input[type=search], .mc-ab-count, h1, h2";
  add(d, "top", 0, 0, SEL, 140);
  let inner = null;
  if (modus == "addressbook" || modus == "settings") inner = tm.currentTabInfo?.browser;
  if (inner?.contentDocument) { const b = inner.getBoundingClientRect(); add(inner.contentDocument, "ab", b.left, b.top, SEL, 140 - b.top + 60); }
  const kern = S.kern(modus);
  S.liste = list; S.kernEl = kern;
  S.kernOff = (() => { try { const win = kern.ownerDocument.defaultView; const e = win.browsingContext?.embedderElement; return e && win != w ? e.getBoundingClientRect().left : 0; } catch { return 0; } })();
  return list.map(x => x.key);
};
S.mess = () => {
  const f = { t: Math.round(performance.now() * 100) / 100, e: {} };
  const k = S.kernEl ? S.kernEl.getBoundingClientRect() : null;
  f.kern = k ? [Math.round((k.left + S.kernOff) * 10) / 10, Math.round(k.width * 10) / 10] : null;
  for (const { key, el, ox, oy } of S.liste) {
    const r = el.getBoundingClientRect();
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    const vis = r.width && cs.display != "none" && cs.visibility != "hidden" ? parseFloat(cs.opacity) : 0;
    f.e[key] = [Math.round((r.left + ox) * 10) / 10, Math.round((r.top + oy) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, vis];
  }
  f.win = [w.outerWidth, w.outerHeight, w.innerWidth, w.innerHeight, w.mozInnerScreenX, w.mozInnerScreenY, w.screenX, w.screenY];
  f.flags = (w.__mcSpacesAnimating ? "S" : "") + (S.kernEl?.__mcAnimating ? "K" : "") + (tm.tabInfo[0]?.chromeBrowser?.contentWindow?.__mcAnimating ? "M" : "");
  try { const cs = w.getComputedStyle(d.getElementById("unifiedToolbarContainer")); f.vars = [cs.getPropertyValue("--mc-side-right").trim(), cs.getPropertyValue("--mc-tab-offset").trim(), cs.getPropertyValue("--mc-tl-reserve").trim()];
    const st = d.getElementById("unifiedToolbarContainer").style; f.bar = {}; for (let i = 0; i < st.length; i++) { const n = st[i]; if (n.startsWith("--mc-")) f.bar[n] = st.getPropertyValue(n); }
    const ta = d.getElementById("task-actions-toolbar")?.style; if (ta) f.bar["ta:--mc-ta-left"] = ta.getPropertyValue("--mc-ta-left"); } catch {}
  f.spacesHidden = !!w.gSpacesToolbar?.isHidden;
  return f;
};
S.start = () => {
  S.daten = []; S.stop = false; S.fertig = false;
  const loop = () => { S.daten.push(S.mess()); if (!S.stop) w.requestAnimationFrame(loop); else S.fertig = true; };
  w.requestAnimationFrame(loop);
};
S.ende = async () => { S.stop = true; await until(() => S.fertig, 2000); return S.daten; };
"""


def messen(m, modus, click_js, nachlauf_ms=600):
    """Fühler starten, Knopf drücken, nachlaufen lassen, Fühler beenden, Ruhezustand als letztes Bild anhängen."""
    m.js(SAMPLER + f'w.__mcSpr.sammle("{modus}"); w.__mcSpr.start(); await wait(100); return 1;')
    m.js(click_js + " return 1;")
    m.js(f"await wait({nachlauf_ms}); return 1;")
    daten = m.js(SAMPLER + "return await w.__mcSpr.ende();")
    m.js("await ruhig(1500); return 1;")
    daten.append(m.js(SAMPLER + "return w.__mcSpr.mess();"))
    return daten


def auswerten(fr, toleranz=2):
    """Liefert dict: ende (Sprünge > 1 px nach dem Ende der Bewegung), ruck (Einzelschritte über dem größten Schritt der
    Seitenleistenkante + toleranz, und Richtungswechsel), luecken (> 20 ms), win (Fensteränderungen), kante (größter Schritt)."""
    out = {"bilder": len(fr), "ende": {}, "ruck": {}, "luecken": [], "win": [], "i0": None, "i1": None}
    ts = [f["t"] for f in fr[:-1]]
    out["luecken"] = [round(b - a, 1) for a, b in zip(ts, ts[1:]) if b - a > 20]
    ws = [f["kern"][1] if f.get("kern") else 0 for f in fr]
    # rechte Kante der Seitenleiste im Fenster (mit der Bereiche-Leiste davor): das Maß, dem die Knöpfe folgen dürfen
    kanten = [(f["kern"][0] + f["kern"][1]) if f.get("kern") else 0 for f in fr]
    bewegt = [i for i in range(1, len(ws)) if abs(ws[i] - ws[i - 1]) > 0.5]
    if not bewegt:
        out["fehler"] = "keine Breitenänderung der Seitenleiste"
        return out
    i0, i1 = bewegt[0], bewegt[-1]
    out["i0"], out["i1"] = i0, i1
    out["dauer_ms"] = round(ts[min(i1, len(ts) - 1)] - ts[i0 - 1])
    out["breite"] = [ws[0], ws[-1]]
    kante_max = max(abs(kanten[i] - kanten[i - 1]) for i in range(i0, i1 + 1))
    kante_weg = abs(kanten[i1] - kanten[i0 - 1]) or 1
    out["kante"] = round(kante_max, 1)
    out["weg"] = {}
    keys = set(k for f in fr for k in f["e"])
    for k in sorted(keys):
        serie = [f["e"].get(k) for f in fr]
        # Ein Element darf je Bild so viel Weg machen wie die Seitenleistenkante, anteilig seines Gesamtwegs: die Knöpfe
        # im Adressbuch folgen der Kontaktliste, die sich mit der Seitenleiste zugleich verbreitert (Weg 1,4 × Kante),
        # und laufen mit derselben Kurve – gleichmäßig, aber schneller als die Kante; ein Sprung bleibt ein Sprung
        # (der frühere Satz 207 px in einem Bild lag beim Fünffachen).
        a0, a1 = serie[i0 - 1], serie[i1]
        weg = max(abs(a1[0] - a0[0]), abs(a1[2] - a0[2])) if a0 and a1 else 0
        anteil = max(1.0, weg / kante_weg)
        erlaubt = kante_max * anteil + toleranz
        if anteil > 1.0:
            out["weg"][k] = round(anteil, 2)
        for i in range(i1 + 1, len(fr)):
            a, b = serie[i - 1], serie[i]
            if not a or not b or (a[4] == 0 and b[4] == 0):
                continue
            dx = max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]), abs(a[3] - b[3]))
            if dx > 1:
                out["ende"].setdefault(k, []).append((i - i1, round(dx, 1), [round(a[j] - b[j], 1) for j in range(4)]))
        steps = []
        for i in range(i0, i1 + 1):
            a, b = serie[i - 1], serie[i]
            if not a or not b or (a[4] == 0 and b[4] == 0):
                continue
            steps.append((i, b[0] - a[0], b[2] - a[2], b[1] - a[1]))
        big = [(i, round(dl, 1), round(dw, 1), round(dt, 1)) for i, dl, dw, dt in steps if max(abs(dl), abs(dw), abs(dt)) > erlaubt]
        dirs = [1 if dl > 0.5 else -1 for _, dl, _, _ in steps if abs(dl) > 0.5]
        wechsel = sum(1 for a, b in zip(dirs, dirs[1:]) if a != b)
        if big or wechsel:
            out["ruck"][k] = {"gross": big[:5], "richtungswechsel": wechsel}
    w0, w1 = fr[0]["win"], fr[-1]["win"]
    if w0 != w1:
        out["win"] = [w0, w1]
    for i in range(1, len(fr)):
        if fr[i]["win"] != fr[i - 1]["win"]:
            out.setdefault("win_wann", []).append((i, fr[i]["win"]))
    out["vars"] = [fr[0].get("vars"), fr[i1].get("vars") if i1 < len(fr) else None, fr[-1].get("vars")]
    return out
