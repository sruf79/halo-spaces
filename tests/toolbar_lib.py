"""Gemeinsame Hilfen für die Toolbar-Messung (toolbar_messung.py) und die Prüfung in halo_test.py (ohne Import von halo_test)."""

# ein Messbild: Toolbar-Einträge, Suchfeld, Überlauf, Today-Pane
MESS = r"""
w.__mcTb = w.__mcTb || {};
w.__mcTb.mess = () => {
  const content = d.getElementById("unifiedToolbarContent");
  const R = e => { const r = e.getBoundingClientRect(); return Math.round(r.width * 10) / 10; };
  const items = [...content.children].map(li => {
    const id = li.getAttribute("item-id") || li.id;
    const cs = w.getComputedStyle(li);
    const vis = !li.hidden && cs.display != "none" && !li.hasAttribute("mc-squeezed") && R(li) > 0;
    return [id, R(li), vis ? 1 : 0];
  });
  const search = content.querySelector(':scope > li[item-id="search-bar"]');
  const tp = d.getElementById("today-pane-panel");
  const tpw = tp && w.TodayPane?.isVisible && !tp.collapsed ? R(tp) : 0;
  const st = d.getElementById("unifiedToolbarContainer").style;
  return { w: w.outerWidth, inner: w.innerWidth, items, search: search ? R(search) : null, searchMax: search ? w.getComputedStyle(search).maxWidth : null,
           tp: tpw, tpLeft: tp && tpw ? Math.round(tp.getBoundingClientRect().left) : null, gap: st.getPropertyValue("--mc-write-gap"), fit: st.getPropertyValue("--mc-search-fit"),
           t: Math.round(performance.now()) };
};
"""


def auswerten(daten, richtung):
    """Richtungswechsel beim Verkleinern (bzw. Vergrößern): Suchfeld, Pillen, Überlauf, Today-Pane, Abstandhalter."""
    s = 1 if richtung == "kleiner" else -1  # erwartet: nicht breiter (kleiner) bzw. nicht schmaler (groesser)
    out = {"suche": [], "pillen": [], "today": [], "lupe": [], "fenster": []}
    for a, b in zip(daten, daten[1:]):
        if (a["w"] - b["w"]) * s < 0 and not b.get("ruhe"):
            out["fenster"].append((a["w"], b["w"]))
        if a["search"] is not None and b["search"] is not None and (b["search"] - a["search"]) * s > 0.5:
            out["suche"].append((a["w"], b["w"], a["search"], b["search"]))
        if a["search"] is not None and a["search"] <= 41 and b["search"] is not None and b["search"] > 41 and s > 0:
            out["lupe"].append((a["w"], b["w"], a["search"], b["search"]))
        va = {i[0] for i in a["items"] if i[2]}
        vb = {i[0] for i in b["items"] if i[2]}
        zurueck = (vb - va) if s > 0 else (va - vb)
        zurueck -= {"mcToolbarOverflow"}
        if zurueck:
            out["pillen"].append((a["w"], b["w"], sorted(zurueck)))
        if (b["tp"] - a["tp"]) * s > 0.5:
            out["today"].append((a["w"], b["w"], a["tp"], b["tp"]))
    return out
