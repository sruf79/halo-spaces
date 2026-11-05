#!/usr/bin/env python3
"""Design-Rundgang auswerten (tests/MAC-MINI.md Abschnitt 17).

Liest aus einem Rundgang-Ordner (~/halo-tour/<datum>/) die Ergebnisse von
ui_tour.py (<hell|dunkel>-ergebnis.json) und die Messwerte (--messung,
<hell|dunkel>-messung.json) und vergleicht
  a) je Kategorie und Maß gegen den häufigsten Wert (Modus) – Ausreißer,
  b) mit dem vorigen Rundgang: neue und behobene Ausreißer, geänderte Werte,
     neu nicht erreichte Oberflächen, neue Original-Symbole.
Bilder werden nur informativ verglichen (geändert ja/nein), daraus entsteht
kein Ausreißer – Datum und Uhrzeit ändern sich von selbst.
Schreibt vergleich.json und vergleich.md in den Ordner.

  rundgang_vergleich.py <ordner> [--vorher <ordner>]
Ohne --vorher: der jüngste ältere Ordner neben <ordner> mit Messwerten.
"""
import argparse
import collections
import glob
import hashlib
import json
import os

KATEGORIEN = [("popup", "Popups und Kontextmenüs"), ("panel", "Panels und Popover"), ("dialog", "Dialoge und Rückfragen"),
              ("fenster", "Eigene Fenster"), ("bereich", "Bereiche"), ("zustand", "Zustände"), ("suchfeld", "Suchfelder")]


def lade(ordner, schema, art):
    p = os.path.join(ordner, f"{schema}-{art}.json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p, encoding="utf-8"))
    if art == "ergebnis":
        return {e["id"]: e for e in d if isinstance(e, dict) and "id" in e}
    return d


def kategorie(e, m):
    k = e.get("kind")
    if k in ("popup", "menue"):
        tag = ((m or {}).get("popup") or {}).get("tag", "")
        t = e.get("title", "").lower()
        return "panel" if tag in ("panel", "html:dialog") or "panel" in t or "popover" in t else "popup"
    return k if k in ("dialog", "fenster", "bereich") else "zustand"


def popup_werte(p):
    pp = p.get("popup") or {}
    sep = pp.get("sep") or {}
    return {"Radius": pp.get("radius"), "Hintergrund": pp.get("bg"), "Schatten": pp.get("shadow"), "Rand": pp.get("border"),
            "Innenabstand": pp.get("padding"), "Zeilenhöhe": pp.get("itemH"), "Schriftgröße": pp.get("itemFont"),
            "Einzug Eintrag": pp.get("itemPad"), "Trennlinie Farbe": sep.get("color"), "Trennlinie Abstand": sep.get("margin")}


def doc_werte(p):
    v = {"Hintergrund": p.get("bg"), "Schrift": p.get("font")}
    bs = p.get("buttons") or []
    nb = [b for b in bs if not b.get("dflt")]
    db = [b for b in bs if b.get("dflt")]
    if nb:
        v["Knopf Höhe"] = nb[-1].get("h")
        v["Knopf Radius"] = nb[-1].get("radius")
        v["Knopf Hintergrund"] = nb[-1].get("bg")
    if db:
        v["Hauptknopf Höhe"] = db[0].get("h")
        v["Hauptknopf Radius"] = db[0].get("radius")
        v["Hauptknopf in Akzentfarbe"] = "ja" if db[0].get("accent") else "nein (" + str(db[0].get("bg")) + ")"
        unten = [b for b in bs if abs(b.get("h", 0) - db[0].get("h", 0)) <= 4]
        if len(unten) > 1:
            v["Hauptknopf ganz rechts"] = "ja" if db[0].get("x", 0) >= max(b.get("x", 0) for b in unten) else "nein"
    elif bs:
        v["Hauptknopf in Akzentfarbe"] = "kein Hauptknopf"
    ins = p.get("inputs") or []
    if ins:
        v["Feld Höhe"] = ins[0].get("h")
        v["Feld Radius"] = ins[0].get("radius")
        v["Feld Rand"] = ins[0].get("border")
    gs = [g for g in (p.get("groups") or []) if not str(g.get("border", "")).startswith("0px")]
    if gs:
        v["Gruppenrahmen"] = f"{gs[0].get('border')} r={gs[0].get('radius')}"
    return v


def text(v):
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)


def auswerten(ordner):
    """Ausreißer je Schema: {(schema, kategorie, maß, id): wert}, dazu Modus je Maß."""
    aus, modi, nicht, orig, suchfelder, bilder, gemessen = {}, {}, {}, collections.defaultdict(set), {}, {}, {}
    schemata = [s for s in ("hell", "dunkel") if lade(ordner, s, "ergebnis") is not None]
    for sc in schemata:
        erg = lade(ordner, sc, "ergebnis")
        mess = lade(ordner, sc, "messung") or {}
        nicht[sc] = {i: e.get("reason", "") for i, e in erg.items() if not e.get("ok")}
        for i, e in erg.items():
            for f in e.get("files") or []:
                p = os.path.join(ordner, os.path.basename(f))
                if os.path.exists(p):
                    bilder[f"{sc} {os.path.basename(f)}"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        zeilen = collections.defaultdict(dict)
        gemessen[sc] = {i for i, m in mess.items() if i in erg and erg[i].get("ok") and isinstance(m, dict)}
        for i, m in mess.items():
            if i not in erg or not isinstance(m, dict):
                continue
            zeilen[kategorie(erg[i], m)][i] = popup_werte(m) if m.get("kind") == "popup" else doc_werte(m)
            for key in ("icons", "paneIcons", "mainIcons"):
                for k in m.get(key) or {}:
                    if k.startswith("original "):
                        orig[k[9:]].add(i)
            for f in m.get("suchfelder") or []:
                name = f"{i}: {f.get('name')}"
                suchfelder[(sc, name)] = f
                if f.get("hoverGleich") is False:
                    aus[(sc, "suchfeld", "Hover ändert Feld oder Lupe", name)] = " → ".join(
                        f"{a} ⇒ {b}" for a, b in zip(f.get("ruhe") or [], f.get("hover") or []) if a != b)[:300]
                if f.get("radius") not in (None, "999px"):
                    aus[(sc, "suchfeld", "Radius (Kapsel 999px)", name)] = f.get("radius")
        for kat, reihen in zeilen.items():
            masse = []
            for v in reihen.values():
                masse += [k for k in v if k not in masse]
            for k in masse:
                c = collections.Counter(text(v[k]) for v in reihen.values() if v.get(k) not in (None, ""))
                if not c:
                    continue
                modus, n = c.most_common(1)[0]
                modi[(sc, kat, k)] = {"modus": modus, "anteil": f"{n}/{sum(c.values())}"}
                for i, v in reihen.items():
                    if v.get(k) not in (None, "") and text(v[k]) != modus:
                        aus[(sc, kat, k, i)] = text(v[k])
    return {"schemata": schemata, "ausreisser": aus, "modi": modi, "nicht": nicht,
            "orig": {k: sorted(v) for k, v in orig.items()}, "bilder": bilder, "gemessen": gemessen,
            "messung": any(lade(ordner, s, "messung") for s in schemata)}


def vorher_finden(ordner):
    eltern = os.path.dirname(os.path.abspath(ordner))
    eigen = os.path.basename(os.path.abspath(ordner))
    kand = sorted(d for d in os.listdir(eltern) if d < eigen and glob.glob(os.path.join(eltern, d, "*-messung.json")))
    return os.path.join(eltern, kand[-1]) if kand else None


def schluessel(k):
    return " | ".join(str(x) for x in k)


def main():
    ap = argparse.ArgumentParser(description="Design-Rundgang auswerten und mit dem vorigen vergleichen")
    ap.add_argument("ordner")
    ap.add_argument("--vorher", help="Ordner des vorigen Rundgangs (Standard: jüngster ältere mit Messwerten)")
    args = ap.parse_args()
    jetzt = auswerten(args.ordner)
    vorher_ordner = args.vorher or vorher_finden(args.ordner)
    vorher = auswerten(vorher_ordner) if vorher_ordner else None

    a = jetzt["ausreisser"]
    v = vorher["ausreisser"] if vorher else {}
    # nur Schemata vergleichen, die in beiden Läufen gemessen wurden (dunkel läuft nicht jede Woche)
    gemeinsam = set(jetzt["schemata"]) & set(vorher["schemata"]) if vorher else set()
    # nur Oberflächen, die in beiden Läufen erreicht und gemessen wurden (sonst wäre jede
    # nicht erreichte Oberfläche „behoben“); Suchfelder heißen „<id>: <feld>“
    beide = lambda k: k[3].split(":")[0] in jetzt["gemessen"].get(k[0], ()) and k[3].split(":")[0] in vorher["gemessen"].get(k[0], ())
    neu = {k: w for k, w in a.items() if k[0] in gemeinsam and k not in v and beide(k)}
    behoben = {k: w for k, w in v.items() if k[0] in gemeinsam and k not in a and beide(k)}
    geaendert = {k: (v[k], w) for k, w in a.items() if k in v and v[k] != w}
    neu_nicht = {sc: {i: g for i, g in jetzt["nicht"].get(sc, {}).items() if i not in vorher["nicht"].get(sc, {})}
                 for sc in gemeinsam} if vorher else {}
    wieder_da = {sc: [i for i in vorher["nicht"].get(sc, {}) if i not in jetzt["nicht"].get(sc, {})] for sc in gemeinsam} if vorher else {}
    neue_symbole = {k: ids for k, ids in jetzt["orig"].items() if vorher and k not in vorher["orig"]}
    weg_symbole = sorted(k for k in (vorher["orig"] if vorher else {}) if k not in jetzt["orig"])
    bilder_geaendert = sorted(k for k, h in jetzt["bilder"].items() if vorher and k in vorher["bilder"] and vorher["bilder"][k] != h)

    erg = {
        "ordner": os.path.abspath(args.ordner), "vorher": vorher_ordner and os.path.abspath(vorher_ordner),
        "schemata": jetzt["schemata"], "verglichen": sorted(gemeinsam),
        "kennzahlen": {sc: {"ok": len(lade(args.ordner, sc, "ergebnis")) - len(jetzt["nicht"][sc]),
                            "nicht_erreicht": len(jetzt["nicht"][sc]),
                            "ausreisser": sum(1 for k in a if k[0] == sc),
                            "neu": sum(1 for k in neu if k[0] == sc), "behoben": sum(1 for k in behoben if k[0] == sc)}
                       for sc in jetzt["schemata"]},
        "ausreisser": [{"schema": k[0], "kategorie": k[1], "mass": k[2], "id": k[3], "wert": w,
                        **(jetzt["modi"].get(k[:3]) or {})} for k, w in sorted(a.items())],
        "neu": [schluessel(k) + " = " + w for k, w in sorted(neu.items())],
        "behoben": [schluessel(k) + " (war " + w + ")" for k, w in sorted(behoben.items())],
        "geaendert": [schluessel(k) + f": {x} → {y}" for k, (x, y) in sorted(geaendert.items())],
        "neu_nicht_erreicht": neu_nicht, "wieder_erreicht": wieder_da,
        "nicht_erreicht": jetzt["nicht"],
        "original_symbole": jetzt["orig"], "neue_original_symbole": neue_symbole, "ersetzte_original_symbole": weg_symbole,
        "bilder_geaendert_info": bilder_geaendert,
    }
    json.dump(erg, open(os.path.join(args.ordner, "vergleich.json"), "w"), indent=1, ensure_ascii=False)

    z = [f"# Design-Rundgang {os.path.basename(os.path.abspath(args.ordner))}", ""]
    z.append(f"Vorher: {os.path.basename(vorher_ordner) if vorher_ordner else '– (erster Lauf mit Messwerten)'}; "
             f"verglichen: {', '.join(sorted(gemeinsam)) or '–'}")
    z.append("")
    for sc, k in erg["kennzahlen"].items():
        z.append(f"- {sc}: {k['ok']} OK, {k['nicht_erreicht']} nicht erreicht, {k['ausreisser']} Ausreißer "
                 f"(neu {k['neu']}, behoben {k['behoben']})")
    for titel, liste in (("Neue Ausreißer", erg["neu"]), ("Behobene Ausreißer", erg["behoben"]), ("Geänderte Werte", erg["geaendert"])):
        z += ["", f"## {titel} ({len(liste)})", ""] + [f"- {x}" for x in liste[:200]]
    z += ["", "## Neu nicht erreicht", ""] + [f"- {sc} {i}: {g}" for sc, d in neu_nicht.items() for i, g in d.items()]
    z += ["", "## Neue Original-Symbole", ""] + [f"- {k} ({len(ids)}: {', '.join(ids[:6])})" for k, ids in neue_symbole.items()]
    z += ["", "## Alle Ausreißer gegen den Modus", ""]
    for kat, name in KATEGORIEN:
        zeilen = [x for x in erg["ausreisser"] if x["kategorie"] == kat]
        if zeilen:
            z += ["", f"### {name}", ""] + [
                f"- {x['schema']} {x['mass']}: {x['id']} = {x['wert']}" + (f" (Modus {x['modus']}, {x['anteil']})" if x.get("modus") else "")
                for x in zeilen]
    z += ["", f"Bilder geändert (nur Information): {len(bilder_geaendert)}", ""]
    open(os.path.join(args.ordner, "vergleich.md"), "w").write("\n".join(z) + "\n")
    print(f"vergleich.md/json geschrieben: {', '.join(f'{sc} {k}' for sc, k in erg['kennzahlen'].items())}")


if __name__ == "__main__":
    main()
