#!/usr/bin/env python3
"""Token-Bilanz der Claude-Sitzungen auf neon (nur Lesen, kein Claude-Aufruf, kein Netz).

Entscheidung des Maintainers (Cloud-Sitzung global.design.comparison,
6.11.2026), auf die Frage, ob neon den Tokenverbrauch aus den Protokollen je
Routine zusammenzählen soll, Wortlaut: „ist das viel aufwand? wenn nein - ja
token zusammenzählen“.

Quelle: ~/.claude/projects/*/<sitzung>.jsonl und die Unteragenten dazu
(<sitzung>/subagents/agent-*.jsonl). Jede Zeile vom Typ „assistant“ trägt
message.usage (input_tokens, output_tokens, cache_creation_input_tokens,
cache_read_input_tokens), message.model und timestamp; sessionId und cwd stehen
in derselben Zeile. Gezählt werden nur diese vier Zahlen, nie Nachrichtentexte.

Doppelzählung: Claude schreibt eine Antwort je Inhaltsblock (Text, Werkzeug,
Denken) als eigene Zeile mit gleicher message.id/requestId, beim Streaming
mit wachsendem output_tokens. Je (message.id, requestId) zählt nur der
Eintrag mit den meisten Ausgabe-Tokens, einmal.

Tag: lokales Datum des Zeitstempels.

Zuordnung einer Sitzung zu einer Art (erste passende Regel gewinnt; ein
Unteragent gehört zur Art seiner Hauptsitzung):
  1. neon-board  Arbeitsordner (cwd) endet auf halo-board oder Sitzungsname
                 beginnt mit „neon-board“
  2. Lauf-Logs   die Sitzungs-ID steht in ~/halo-nacht/*.log („… Sitzung <id>“):
                 …-woche.log wochenpruefung, …-doku.log dokupruefung,
                 …-rundgang.log rundgang, sonst <datum>.log nachtlauf
  3. Auftrag     erste Eingabe der Sitzung enthält „Unbeaufsichtigter Nachtlauf“,
                 „Unbeaufsichtigte Wochenprüfung“, „Unbeaufsichtigte Doku-Prüfung“
                 bzw. „Unbeaufsichtigter Design-Rundgang“ (Auftragstexte)
  4. push        erste Eingabe beginnt mit „Aufgabe ohne Rückfrage: Lade bei
                 Bedarf“ (push() in tests/lauf-hilfen.zsh, haiku)
  5. github-komm erste Eingabe beginnt mit <scheduled-task name="halo-github-
                 kommunikation" oder Sitzungsname enthält „GitHub-Kommunikation“
                 bzw. „github.comm“
  6. neon        Hook-Kennzeichen (siehe unten), Sitzungsname beginnt mit „neon“
                 oder erste Eingabe enthält „Entwicklungssitzung für halo.spaces
                 auf neon“
  7. sonstige    alles andere (von Hand gestartete Sitzungen, Sitzungen anderer
                 Ordner, Unteragenten ohne Hauptdatei)
Sitzungsname = letzter Eintrag „custom-title“ der Datei, sonst der Name der
noch laufenden Sitzung aus ~/.claude/sessions/<pid>.json (neon heißt dort
„neon“, auch wenn das Protokoll keinen Hook-Eintrag hat, z. B. nach /clear).

Unteragenten (<sitzung>/subagents/*.jsonl) stehen zusätzlich getrennt nach
Modell da (Tabelle „Unteragenten je Modell“, JSON unteragenten_modell und
unteragenten_art_modell), um die Einstufung Sonnet/Opus von neon zu verfolgen
(docs/neon-sitzung.md); in den Zeilen je Art sind sie schon
enthalten.

Hook-Kennzeichen (Entscheidung des Maintainers vom 6.11.2026, Sitzung
global.design.comparison, Wortlaut: „punkt 1 beauftragen.“ – täglicher Neustart
von neon; Deutung dieser Sitzung: Titel und Sitzungs-ID wechseln dabei, die
Erkennung darf sich nicht darauf stützen): Der SessionStart-Hook
tests/neon-hook.sh gibt nur in den Sitzungen neon und neon-board etwas aus. Das
Protokoll hält ihn als Eintrag attachment/hook_success mit dem Befehl
„…neon-hook.sh“ fest; beginnt dessen Ausgabe mit „neon-board“, ist es
neon-board, sonst bei „neon“ die Sitzung neon (andere Sitzungen im Checkout
führen den Hook auch aus, er gibt dort nichts aus). Gelesen werden nur das Feld
command und die ersten Zeichen der Hook-Ausgabe, nie Nachrichtentexte. Das gilt
erst, seit der Hook im Checkout eingetragen ist; ältere Sitzungen erkennen
weiter Name und Auftrag.

Aufruf:
  tests/token-bilanz.py [--tage N] [--json [DATEI]] [--basis]
    --tage N       letzte N Tage inklusive heute (Standard 7)
    --json [DATEI] Zahlen in die JSON-Datei schreiben (Standard
                   ~/halo-aufgaben/token-kennzahlen.json); die Datei hat die
                   Abschnitte {"basis": {...}, "wochen": {"<bis-datum>": {...}}},
                   vorhandene Abschnitte bleiben unverändert, nur der eigene
                   Schlüssel wird gesetzt
    --basis        mit --json: Abschnitt „basis“ schreiben statt Wochenwert
"""
import argparse
import glob
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta

HOME = os.path.expanduser("~")
PROJEKTE = os.path.join(HOME, ".claude", "projects")
LOGS = os.path.join(HOME, "halo-nacht")
STANDARD_JSON = os.path.join(HOME, "halo-aufgaben", "token-kennzahlen.json")
ARTEN = ["nachtlauf", "wochenpruefung", "dokupruefung", "rundgang",
         "github-komm", "neon", "neon-board", "push", "sonstige"]
FELDER = ["input_tokens", "output_tokens",
          "cache_creation_input_tokens", "cache_read_input_tokens"]
KURZ = {"input_tokens": "Eingabe", "output_tokens": "Ausgabe",
        "cache_creation_input_tokens": "Cache-Schreiben",
        "cache_read_input_tokens": "Cache-Lesen"}
AUFTRAG_MARKEN = [("Unbeaufsichtigter Nachtlauf", "nachtlauf"),
                  ("Unbeaufsichtigte Wochenprüfung", "wochenpruefung"),
                  ("Unbeaufsichtigte Doku-Prüfung", "dokupruefung"),
                  ("Unbeaufsichtigter Design-Rundgang", "rundgang")]
SID_RE = re.compile(r"Sitzung ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")


def lauf_sitzungen():
    """Sitzungs-ID → Art aus den Protokollen der Läufe unter ~/halo-nacht."""
    res = {}
    for pfad in sorted(glob.glob(os.path.join(LOGS, "*.log"))):
        name = os.path.basename(pfad)
        if name.endswith("-woche.log"):
            art = "wochenpruefung"
        elif name.endswith("-doku.log"):
            art = "dokupruefung"
        elif name.endswith("-rundgang.log"):
            art = "rundgang"
        elif re.match(r"\d{4}-\d{2}-\d{2}\.log$", name):
            art = "nachtlauf"
        else:
            continue
        try:
            with open(pfad, encoding="utf-8", errors="replace") as f:
                for zeile in f:
                    for sid in SID_RE.findall(zeile):
                        res.setdefault(sid, art)
        except OSError:
            pass
    return res


def erste_eingabe_text(d):
    """Text der ersten Benutzereingabe (nur zum Erkennen, wird nie ausgegeben)."""
    inhalt = d.get("message", {}).get("content")
    if isinstance(inhalt, str):
        return inhalt
    teile = []
    for b in inhalt or []:
        if isinstance(b, dict) and b.get("type") == "text":
            teile.append(b.get("text", ""))
    return "\n".join(teile)


def hook_art(zeile):
    """„neon“ oder „board“, wenn die Zeile die Ausgabe von neon-hook.sh festhält."""
    try:
        d = json.loads(zeile)
    except ValueError:
        return None
    a = d.get("attachment")
    if not isinstance(a, dict) or a.get("type") != "hook_success" \
            or "neon-hook.sh" not in str(a.get("command")):
        return None
    aus = str(a.get("stdout") or a.get("content") or "").lstrip()
    if aus.startswith("neon-board"):
        return "board"
    return "neon" if aus.startswith("neon") else None


def laufende_namen():
    """Sitzungs-ID → Name der gerade laufenden Sitzungen (~/.claude/sessions/<pid>.json).
    Erkennt neon auch ohne Hook-Eintrag im Protokoll (z. B. nach /clear, bevor
    neon-hook.sh im Checkout stand); gilt nur, solange die Sitzung läuft."""
    res = {}
    for pfad in glob.glob(os.path.join(HOME, ".claude", "sessions", "*.json")):
        try:
            with open(pfad, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and d.get("sessionId") and d.get("name"):
            res[d["sessionId"]] = str(d["name"])
    return res


NAMEN = None


def sitzung_art(meta, log_arten):
    global NAMEN
    if NAMEN is None:
        NAMEN = laufende_namen()
    sid, cwd, titel, erste = meta["id"], meta["cwd"] or "", meta["titel"] or "", meta["erste"] or ""
    hook = meta.get("hook")
    titel = titel or NAMEN.get(sid, "")
    if cwd.rstrip("/").endswith("halo-board") or titel.startswith("neon-board") \
            or hook == "board":
        return "neon-board"
    if sid in log_arten:
        return log_arten[sid]
    for marke, art in AUFTRAG_MARKEN:
        if marke in erste:
            return art
    if erste.startswith("Aufgabe ohne Rückfrage: Lade bei Bedarf"):
        return "push"
    if (erste.startswith('<scheduled-task name="halo-github-kommunikation"')
            or "GitHub-Kommunikation" in titel or "github.comm" in titel):
        return "github-komm"
    if hook == "neon" or titel.startswith("neon") or "Entwicklungssitzung für halo.spaces auf neon" in erste:
        return "neon"
    return "sonstige"


def lese_alles(von):
    """Liest alle Protokolle. Gibt (Sitzungsmeta, Antworten) zurück.
    Antworten: (message.id, requestId) → (ausgabe, zeit, modell, usage, sitzung,
    unteragent)."""
    metas = {}      # Sitzungs-ID → Meta aus der Hauptdatei
    antworten = {}
    dateien = glob.glob(os.path.join(PROJEKTE, "*", "*.jsonl")) + \
        glob.glob(os.path.join(PROJEKTE, "*", "*", "subagents", "*.jsonl"))
    for pfad in dateien:
        teile = pfad.split(os.sep)
        unter = "subagents" in teile
        sid_datei = teile[-3] if unter else os.path.basename(pfad)[:-6]
        try:
            if os.path.getmtime(pfad) < von.timestamp() - 86400:
                continue            # seit Beginn des Zeitraums nicht mehr beschrieben
        except OSError:
            continue
        meta = metas.setdefault(sid_datei, {"id": sid_datei, "cwd": None,
                                            "titel": None, "erste": None,
                                            "hook": None})
        try:
            f = open(pfad, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with f:
            for zeile in f:
                if not unter and "neon-hook.sh" in zeile and '"hook_success"' in zeile:
                    h = hook_art(zeile)
                    if h:
                        meta["hook"] = h
                    continue
                if '"assistant"' not in zeile and '"custom-title"' not in zeile \
                        and ('"user"' not in zeile or unter or meta["erste"] is not None):
                    continue
                try:
                    d = json.loads(zeile)
                except ValueError:
                    continue
                t = d.get("type")
                if t == "custom-title" and not unter:
                    meta["titel"] = d.get("customTitle") or meta["titel"]
                elif t == "user" and not unter and meta["erste"] is None \
                        and not d.get("isSidechain"):
                    meta["erste"] = erste_eingabe_text(d)[:6000]
                elif t == "assistant":
                    m = d.get("message") or {}
                    u = m.get("usage") or {}
                    if not u or m.get("model") in (None, "<synthetic>"):
                        continue
                    if not unter and meta["cwd"] is None:
                        meta["cwd"] = d.get("cwd")
                    zeit = d.get("timestamp")
                    if not zeit:
                        continue
                    schluessel = (m.get("id") or d.get("uuid"), d.get("requestId"), sid_datei)
                    ausgabe = u.get("output_tokens") or 0
                    alt = antworten.get(schluessel)
                    if alt is None or ausgabe > alt[0]:
                        antworten[schluessel] = (ausgabe, zeit, m["model"],
                                                 {k: int(u.get(k) or 0) for k in FELDER},
                                                 sid_datei, unter)
    return metas, antworten


def leer():
    return {k: 0 for k in FELDER}


def addiere(ziel, quelle):
    for k in FELDER:
        ziel[k] += quelle[k]


def summe(z):
    return sum(z[k] for k in FELDER)


def bilanz(tage):
    heute = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
    von = heute - timedelta(days=tage - 1)
    bis_tag = heute.strftime("%Y-%m-%d")
    log_arten = lauf_sitzungen()
    metas, antworten = lese_alles(von)
    arten_je_sitzung = {sid: sitzung_art(m, log_arten) for sid, m in metas.items()}

    je_art = {}      # Art → Modell → Zahlen
    je_tag = {}      # Tag → Art → Zahlen
    unter_art = {}   # Art → Modell → Zahlen, nur Unteragenten (subagents/*.jsonl)
    sitzungen = {}   # Art → Menge der Sitzungs-IDs
    n_antworten = 0
    for ausgabe, zeit, modell, u, sid, unter in antworten.values():
        try:
            lokal = datetime.fromisoformat(zeit.replace("Z", "+00:00")).astimezone()
        except ValueError:
            continue
        if lokal < von:
            continue
        art = arten_je_sitzung.get(sid, "sonstige")
        tag = lokal.strftime("%Y-%m-%d")
        addiere(je_art.setdefault(art, {}).setdefault(modell, leer()), u)
        addiere(je_tag.setdefault(tag, {}).setdefault(art, leer()), u)
        if unter:
            addiere(unter_art.setdefault(art, {}).setdefault(modell, leer()), u)
        sitzungen.setdefault(art, set()).add(sid)
        n_antworten += 1

    gesamt_art = {}
    for art, modelle in je_art.items():
        z = leer()
        for mz in modelle.values():
            addiere(z, mz)
        gesamt_art[art] = z
    gesamt = leer()
    for z in gesamt_art.values():
        addiere(gesamt, z)
    unter_modell = {}   # Modell → Zahlen über alle Arten (nur Unteragenten)
    for modelle in unter_art.values():
        for m, z in modelle.items():
            addiere(unter_modell.setdefault(m, leer()), z)
    return {
        "zeitraum": {"von": von.strftime("%Y-%m-%d"), "bis": bis_tag, "tage": tage},
        "erstellt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "antworten": n_antworten,
        "sitzungen": {a: len(s) for a, s in sorted(sitzungen.items())},
        "gesamt": gesamt,
        "je_art": {a: gesamt_art[a] for a in ARTEN if a in gesamt_art},
        "je_art_modell": {a: je_art[a] for a in ARTEN if a in je_art},
        # Unteragenten getrennt nach Modell (Einstufung Sonnet/Opus, AGENTS.md
        # „Arbeitsweise von neon“); in je_art/je_art_modell schon enthalten
        "unteragenten_modell": dict(sorted(unter_modell.items())),
        "unteragenten_art_modell": {a: dict(sorted(unter_art[a].items()))
                                    for a in ARTEN if a in unter_art},
        "je_tag": {t: {a: je_tag[t][a] for a in ARTEN if a in je_tag[t]} for t in sorted(je_tag)},
    }


def zahl(n):
    return f"{n:,}".replace(",", ".")


def tabelle(b):
    gesamt = summe(b["gesamt"]) or 1
    ohne_lesen = (gesamt - b["gesamt"]["cache_read_input_tokens"]) or 1
    z = b["zeitraum"]
    print(f"Token-Bilanz {z['von']} bis {z['bis']} ({z['tage']} Tage), {zahl(b['antworten'])} Antworten")
    kopf = ["Art", "Sitz."] + [KURZ[k] for k in FELDER] + ["Summe", "Anteil", "ohne Lesen"]
    zeilen = []
    for art in ARTEN + ["gesamt"]:
        if art == "gesamt":
            zz, sitz = b["gesamt"], sum(b["sitzungen"].values())
        elif art in b["je_art"]:
            zz, sitz = b["je_art"][art], b["sitzungen"].get(art, 0)
        else:
            continue
        s = summe(zz)
        ol = s - zz["cache_read_input_tokens"]
        zeilen.append([art, str(sitz)] + [zahl(zz[k]) for k in FELDER] +
                      [zahl(s), f"{100 * s / gesamt:.1f} %", f"{100 * ol / ohne_lesen:.1f} %"])
    breiten = [max(len(r[i]) for r in [kopf] + zeilen) for i in range(len(kopf))]
    for r in [kopf] + zeilen:
        print("  ".join(c.ljust(breiten[i]) if i == 0 else c.rjust(breiten[i]) for i, c in enumerate(r)))
    modelle = {}
    for ms in b["je_art_modell"].values():
        for m, zz in ms.items():
            modelle[m] = modelle.get(m, 0) + summe(zz)
    print("Je Modell (Summe): " + ", ".join(f"{m} {zahl(n)}" for m, n in sorted(modelle.items())))
    unter = b.get("unteragenten_art_modell") or {}
    if not unter:
        print("Unteragenten: keine")
        return
    print("Unteragenten je Modell (in den Zeilen oben schon enthalten):")
    kopf = ["Art", "Modell"] + [KURZ[k] for k in FELDER] + ["Summe", "Anteil Art"]
    zeilen = []
    for art in ARTEN:
        for m, zz in (unter.get(art) or {}).items():
            s = summe(zz)
            ganz = summe(b["je_art"].get(art) or leer()) or 1
            zeilen.append([art, m] + [zahl(zz[k]) for k in FELDER] +
                          [zahl(s), f"{100 * s / ganz:.1f} %"])
    for m, zz in b["unteragenten_modell"].items():
        zeilen.append(["gesamt", m] + [zahl(zz[k]) for k in FELDER] +
                      [zahl(summe(zz)), f"{100 * summe(zz) / gesamt:.1f} %"])
    breiten = [max(len(r[i]) for r in [kopf] + zeilen) for i in range(len(kopf))]
    for r in [kopf] + zeilen:
        print("  ".join(c.ljust(breiten[i]) if i < 2 else c.rjust(breiten[i]) for i, c in enumerate(r)))


def schreibe_json(pfad, b, basis):
    daten = {}
    try:
        with open(pfad, encoding="utf-8") as f:
            daten = json.load(f)
        if not isinstance(daten, dict):
            raise ValueError("kein Objekt")
    except FileNotFoundError:
        pass
    except ValueError as e:
        sys.exit(f"{pfad} ist kein gültiges JSON ({e}); nichts überschrieben")
    if basis:
        daten["basis"] = b
    else:
        daten.setdefault("wochen", {})[b["zeitraum"]["bis"]] = b
    os.makedirs(os.path.dirname(pfad) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(pfad) or ".", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, pfad)
    print(f"Gespeichert: {pfad} ({'basis' if basis else 'wochen/' + b['zeitraum']['bis']})")


def main():
    p = argparse.ArgumentParser(description="Tokenverbrauch der Claude-Sitzungen je Routine (nur Zählwerte).")
    p.add_argument("--tage", type=int, default=7, help="letzte N Tage inklusive heute (Standard 7)")
    p.add_argument("--json", nargs="?", const=STANDARD_JSON, metavar="DATEI",
                   help=f"Zahlen speichern (Standard {STANDARD_JSON})")
    p.add_argument("--basis", action="store_true", help="mit --json: Abschnitt „basis“ schreiben")
    a = p.parse_args()
    if a.tage < 1:
        p.error("--tage muss mindestens 1 sein")
    if a.basis and not a.json:
        p.error("--basis braucht --json")
    b = bilanz(a.tage)
    tabelle(b)
    if a.json:
        schreibe_json(os.path.expanduser(a.json), b, a.basis)


if __name__ == "__main__":
    main()
