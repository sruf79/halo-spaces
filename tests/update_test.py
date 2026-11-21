#!/usr/bin/env python3
"""Update-Test: stellt das Update eines Bestandsnutzers nach.

Frisches Testprofil (keine Konten, keine echten Daten) mit einer älteren
Version von halo.spaces aus den GitHub-Releases, darin Einstellungen und eine
angepasste Mail-Toolbar wie bei einem Nutzer. Dann über den echten Weg des
Add-on-Managers (Update-Prüfung → updates.json → Paket) auf die neue Version
und prüfen, dass nichts verloren geht: Einstellungen, Toolbar, Chat-Bereich,
keine erneute Begrüßung, userChrome.css im Profil erneuert – auch nach einem
Neustart.

Aufruf:  python3 tests/update_test.py [--from 3.6.0] [--xpi dist/…xpi] [--tb …] [--port 2852]
         (ohne --from: vom letzten veröffentlichten Release aus; release.sh ruft es so auf)
         python3 tests/update_test.py --github     # Update wie bei Nutzern von GitHub
                                                    # (nur lesend; prüft das veröffentlichte updates.json)
Ohne --github liefert ein lokaler Server auf 127.0.0.1 ein updates.json für
das neue Paket aus (das alte Paket bekommt dafür eine lokale update_url).
"""
import argparse
import hashlib
import http.server
import json
import os
import shutil
import ssl
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # kein __pycache__ im Repo
import halo_test as ht  # noqa: E402

REPO = "sruf79/halo-spaces"
# Python von python.org bringt ohne „Install Certificates“ keine Zertifikate mit –
# dann die von macOS verwenden (wie store/atn_upload.py)
CAFILE = None if os.path.exists(ssl.get_default_verify_paths().openssl_cafile or "") else "/etc/ssl/cert.pem"


def fetch(url):
    return urllib.request.urlopen(url, timeout=60, context=ssl.create_default_context(cafile=CAFILE)).read()

# Einstellungen, wie sie ein Nutzer von 3.6 haben könnte (alle gab es in 3.6 schon)
USER_PREFS = {
    "extensions.mailcards.fullConversation": False,
    "extensions.mailcards.unreadTint": False,
    "extensions.mailcards.calendarEmoji": True,
    "extensions.mailcards.emojiCustom": "Chor = \U0001F3B6\nBuchclub = \U0001F4D6",
    "extensions.mailcards.earlyTheme": True,
    "extensions.mailcards.senderLogos": False,
    "extensions.mailcards.hideCollectedAddresses": True,
}
# Einstellungen alter Versionen, deren Option es nicht mehr gibt: die neue Version löscht sie beim Start
# (REMOVED_OPTION_PREFS in implementation.js); geprüft nur, wenn das neue Paket das Aufräumen schon kennt
REMOVED_PREFS = {
    "extensions.mailcards.inlinePrompts": False,
    "extensions.mailcards.showLocalFolders": False,
    "extensions.mailcards.solidMenus": True,
}
EXPECT_CLEANUP = False

# Zustand lesen: Version, Einstellungen, Toolbar, Chat-Knopf, Begrüßung, userChrome.css
STATE_JS = r"""
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
  const prefs = {};
  for (const name of Services.prefs.getChildList("extensions.mailcards.")) {
    const t = Services.prefs.getPrefType(name);
    prefs[name] = t == Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(name)
      : t == Services.prefs.PREF_INT ? Services.prefs.getIntPref(name) : Services.prefs.getStringPref(name);
  }
  const chrome = PathUtils.join(PathUtils.profileDir, "chrome", "userChrome.css");
  const css = await IOUtils.readUTF8(chrome).catch(() => null);
  const chat = w.document.getElementById("chatButton");
  return { version: addon?.version, active: addon?.isActive, prefs,
           toolbar: Services.prefs.getStringPref("mail.unifiedtoolbar.state", ""),
           chat: !!chat && !chat.hidden && chat.getBoundingClientRect().width > 0,
           welcome: [...Services.wm.getEnumerator(null)].filter(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")).length,
           css: css ? css.split("\n").slice(0, 3).join(" ").slice(0, 160) : null,
           themed: !!w.document.documentElement.getAttribute("mc-tab") };
"""


# Seitenleiste ausblenden und Ampel-Abstand messen (Update ohne Neustart mit earlyTheme: der Seitenleisten-Knopf
# überlappte die Fensterknöpfe). Mac: am #unifiedToolbarContainer --mc-tl-reserve und --mc-tl-flow 84px, linke Kante
# des Knopfs rechts der Ampel-Fläche; sonst nur, dass dort nicht 84 px Ampel-Platz gilt. Danach wieder einblenden.
SIDEBAR_JS = r"""
  const doc = w.document, mac = w.matchMedia("(-moz-platform: macos)").matches;
  const bar = doc.getElementById("spacesToolbar"), row = doc.getElementById("unifiedToolbarContainer");
  const btn = doc.getElementById("spacesPinnedButton");
  if (!btn || !row || !bar) return { mac, fehlt: [!btn && "Knopf", !row && "Zeile", !bar && "Leiste"].filter(Boolean) };
  const shown = () => !w.gSpacesToolbar?.isHidden;
  if (shown()) { btn.click(); try { await bis(() => !shown(), "ausgeblendet", 3000); } catch {} }
  await ruhig(800);
  // die Ampel selbst (.titlebar-buttonbox); ihr Behälter reicht als Fläche bis an die Trennlinie der Leiste (88 px)
  const cs = w.getComputedStyle(row), box = doc.querySelector("#unifiedToolbarContainer .titlebar-buttonbox-container");
  const amp = box?.querySelector(".titlebar-buttonbox"), bR = btn.getBoundingClientRect(), xR = amp?.getBoundingClientRect();
  const out = { mac, reserve: cs.getPropertyValue("--mc-tl-reserve").trim(), flow: cs.getPropertyValue("--mc-tl-flow").trim(),
                knopf: Math.round(bR.left), knopfB: Math.round(bR.width), ampel: xR && xR.width ? Math.round(xR.right) : null,
                flaeche: box ? Math.round(box.getBoundingClientRect().right) : null,
                ruht: bar.hasAttribute("mc-ruht"), versteckt: !shown() };
  btn.click(); try { await bis(shown, "eingeblendet", 3000); } catch {} await ruhig(600);
  return out;
"""


# Sortierung im Sammelordner „All Inboxes“ muss Neustart und Update überstehen (zwei Konten, Konversationen an, erst nach
# Datum, dann nach Stern sortiert): zwei Konten mit Posteingang anlegen, Sammelordner einschalten, dort so sortieren. SORT_JS liest danach die Sortierung der Ansicht
# und die im Sammelordner gespeicherte (dbFolderInfo)
SORT_SETUP_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const F = Ci.nsMsgFolderFlags, O = Ci.nsMsgViewSortOrder;
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); }
  for (const host of ["halo-gmail.invalid", "halo-icloud.invalid"]) {
    let srv = MailServices.accounts.findServer("nobody", host, "none");
    if (!srv) {
      srv = MailServices.accounts.createIncomingServer("nobody", host, "none");
      MailServices.accounts.createAccount().incomingServer = srv;
    }
    const root = srv.rootFolder;
    if (!root.getFolderWithFlags(F.Inbox)) {
      if (!root.containsChildNamed("Inbox")) root.createSubfolder("Inbox", null);
      root.getChildNamed("Inbox").setFlag(F.Inbox);
    }
  }
  const a3 = await bis(() => w.gTabmail?.currentAbout3Pane?.folderPane?.isInitialized && w.gTabmail.currentAbout3Pane, "Mail-Tab", 10000);
  if (!a3.folderPane.activeModes.includes("smart")) a3.folderPane.activeModes = ["smart", ...a3.folderPane.activeModes];
  const { SmartMailboxUtils } = ChromeUtils.importESModule("resource:///modules/SmartMailboxUtils.sys.mjs");
  const smart = await bis(() => SmartMailboxUtils.getSmartMailbox().rootFolder.getFolderWithFlags(F.Inbox), "All Inboxes", 8000);
  for (let i = 0; i < 20 && a3.gViewWrapper?.displayedFolder != smart; i++) { a3.displayFolder(smart.URI); await wait(250); }
  await bis(() => a3.gDBView && a3.gViewWrapper?.displayedFolder == smart, "All Inboxes gezeigt", 8000);
  a3.gViewWrapper.showThreaded = true; await wait(300);
  a3.gViewWrapper.sort("dateCol", O.descending); await wait(300);
  a3.gViewWrapper.sort("flaggedCol", O.descending); await wait(500);
  return 1;
"""

SORT_JS = r"""
  const F = Ci.nsMsgFolderFlags;
  const a3 = await bis(() => w.gTabmail?.currentAbout3Pane?.folderPane?.isInitialized && w.gTabmail.currentAbout3Pane, "Mail-Tab", 10000);
  const { SmartMailboxUtils } = ChromeUtils.importESModule("resource:///modules/SmartMailboxUtils.sys.mjs");
  const smart = SmartMailboxUtils.getSmartMailbox().rootFolder.getFolderWithFlags(F.Inbox);
  if (!smart) return { fehlt: "All Inboxes" };
  const shown = a3.gViewWrapper?.displayedFolder == smart;
  for (let i = 0; i < 20 && a3.gViewWrapper?.displayedFolder != smart; i++) { a3.displayFolder(smart.URI); await wait(250); }
  await bis(() => a3.gDBView && a3.gViewWrapper?.displayedFolder == smart, "All Inboxes gezeigt", 8000);
  await wait(500);
  const v = a3.gDBView, i = smart.msgDatabase.dBFolderInfo;
  return { shown, view: [v.sortType, v.sortOrder, v.secondarySortType, v.secondarySortOrder], threaded: a3.gViewWrapper.showThreaded,
           db: [i.sortType, i.sortOrder], modes: a3.folderPane.activeModes };
"""


def sort_check(results, m, when, want):
    s = m.js(SORT_JS)
    ok = not s.get("fehlt") and s["view"] == want["view"] and s["threaded"] == want["threaded"]
    results.append((f"Sortierung in All Inboxes erhalten ({when})", ok, f"{s} (erwartet {want['view']})"))


# Code der Experiment-API im laufenden Thunderbird: jede Funktion im Umfeld der API (auch aus den nachgeladenen
# Teilen api/…, loadPart) und jede Methode von CardEnhancer muss wörtlich im neuen Paket stehen, keine nur aus dem
# alten (Zwischenspeicher der Skripte, gleiche Adresse im Paket). Was dagegen die alte Version im Fenster stehen
# lässt (Menüpunkt mit ihrem Code), prüft recommend_check
CODE_JS = r"""
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const g = ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local")?.experimentAPIManager?.global;
  if (!g) return { fehlt: "experimentAPIManager.global" };
  return JSON.parse(Cu.evalInSandbox(`JSON.stringify((() => {
    const out = {};
    for (const n of Object.getOwnPropertyNames(globalThis)) {
      let v;
      try { v = globalThis[n]; } catch { continue; }
      if (typeof v == "function") out[n] = String(v);
    }
    if (typeof CardEnhancer == "function") {
      for (const [n, d] of Object.entries(Object.getOwnPropertyDescriptors(CardEnhancer.prototype))) {
        if (typeof d.value == "function" && n != "constructor") out["CardEnhancer." + n] = String(d.value);
      }
    }
    return { teile: typeof loadedParts == "undefined" ? [] : loadedParts, code: out };
  })())`, g));
"""


def api_quelle(xpi):
    with zipfile.ZipFile(xpi) as z:
        return "\n".join(z.read(n).decode("utf-8", "replace") for n in z.namelist()
                         if n.startswith("api/") and n.endswith(".js"))


def code_check(results, m, when, xpi, old_xpi):
    quelle, alt_quelle = api_quelle(xpi), api_quelle(old_xpi)
    s = m.js(CODE_JS)
    if s.get("fehlt"):
        results.append((f"Code der Experiment-API aus dem neuen Paket ({when})", False, f"fehlt: {s['fehlt']}"))
        return
    # eingebundene Funktionen (Timer, ExtensionAPI …) stehen in keinem der beiden Pakete; veraltet ist, was nur im
    # alten steht
    eigen = {n: c for n, c in s["code"].items() if "[native code]" not in c and (c in quelle or c in alt_quelle)}
    alt = sorted(n for n, c in eigen.items() if c not in quelle)
    results.append((f"Code der Experiment-API samt Teilen aus dem neuen Paket ({when})",
                    len(eigen) > 50 and "halofenster.js" in s["teile"] and not alt,
                    f"{len(eigen)} Funktionen, Teile {len(s['teile'])}, nicht im neuen Paket: {alt[:8]}"
                    + (f" (+{len(alt) - 8})" if len(alt) > 8 else "")))


# „Recommend“ im Info-Fenster öffnet eine neue Mail (Profil mit Identität wie beim Nutzer mit Konto). Mit 3.34.0
# kopierte der Knopf nach dem Update ohne Neustart nur den Text, erst nach einem Neustart ging die Mail auf
RECOMMEND_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const open = () => [...Services.wm.getEnumerator("msgcompose")];
  const haloWin = () => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")
                                                                   && x.document.getElementById("version")?.textContent);
  const out = { ids: MailServices.accounts.allIdentities.length,
                standard: !!(MailServices.accounts.defaultAccount?.defaultIdentity) };
  const had = new Set(open());
  // ein Menüpunkt „halo.spaces“, nicht der der alten Version
  out.menue = { anzahl: d.querySelectorAll("#mcHaloSpaces").length, alt: !!d.getElementById("mcHaloSpaces")?.__mcAlt };
  await toMail();
  d.getElementById("mcHaloSpaces")?.doCommand();
  const hw = await until(haloWin, 8000);
  const btn = hw?.document.getElementById("recommend");
  out.knopf = !!btn;
  if (!btn) return out;
  await ruhig(300);
  btn.click();
  out.label = Cu.isDeadWrapper(btn) ? null : btn.querySelector(".label")?.textContent;
  const cw = await until(() => open().find(x => !had.has(x) && x.document.readyState == "complete" && x.gMsgCompose), 12000);
  out.mail = !!cw;
  if (cw) {
    cw.gContentChanged = false; if (cw.gMsgCompose) cw.gMsgCompose.bodyModified = false;
    cw.close(); await until(() => cw.closed, 4000);
  }
  try { if (!Cu.isDeadWrapper(hw) && !hw.closed) hw.close(); } catch {}
  if (!cw) {
    // Ursache nennen: Fehler von recommend() in der Experiment-API
    const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
    const g = ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local")?.experimentAPIManager?.global;
    out.fehler = g ? Cu.evalInSandbox("(() => { try { enhancer.recommend(); return 'kein Fehler'; } catch (e) { return String(e) + ' @' + e.lineNumber; } })()", g) : "kein global";
    const late = await until(() => open().find(x => !had.has(x)), 3000);
    if (late) { late.close(); }
  }
  await ruhig(300);
  return out;
"""

IDENTITY_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); }
  const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
  if (!acc.identities.length) { const id = MailServices.accounts.createIdentity(); id.fullName = "Halo Test"; id.email = "halo@example.invalid"; acc.addIdentity(id); }
  return MailServices.accounts.allIdentities.length;
"""


def recommend_check(results, m, when):
    r = m.js(RECOMMEND_JS)
    results.append((f"Info-Fenster: „Recommend“ öffnet eine neue Mail ({when})", r.get("mail") and r.get("menue") == {"anzahl": 1, "alt": False}, str(r)))


def sidebar_check(results, m, when):
    s = m.js(SIDEBAR_JS)
    if s.get("fehlt"):
        results.append((f"Seitenleiste ausblenden ({when})", False, f"fehlt: {s['fehlt']}"))
        return
    results.append((f"Seitenleiste ausgeblendet, Bereiche-Leiste ruht ({when})", s["versteckt"] and s["ruht"],
                    f"ausgeblendet={s['versteckt']} mc-ruht={s['ruht']}"))
    if s["mac"]:
        results.append((f"Ampel-Platz 84px bei ausgeblendeter Seitenleiste ({when})", s["reserve"] == "84px" and s["flow"] == "84px",
                        f"--mc-tl-reserve={s['reserve']} --mc-tl-flow={s['flow']}"))
        results.append((f"Seitenleisten-Knopf überlappt die Ampel nicht ({when})",
                        s["ampel"] is not None and s["knopfB"] > 0 and s["knopf"] >= s["ampel"],
                        f"Knopf links {s['knopf']} px, Ampel rechts {s['ampel']} px (Fläche bis {s['flaeche']} px)"))
    else:
        # Fensterknöpfe rechts: kein Platz von 84 px links
        results.append((f"kein Ampel-Platz links außerhalb des Mac ({when})", s["reserve"] != "84px",
                        f"--mc-tl-reserve={s['reserve']}"))


def version_of(xpi):
    with zipfile.ZipFile(xpi) as z:
        return json.loads(z.read("manifest.json"))["version"]


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def with_update_url(src, dest, url):
    """Kopie des alten Pakets mit eigener update_url (nur für den lokalen Test)."""
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "manifest.json":
                m = json.loads(data)
                m["browser_specific_settings"]["gecko"]["update_url"] = url
                data = json.dumps(m, indent=2).encode()
            zout.writestr(item, data)


def serve(folder):
    """Statischer HTTP-Server nur auf 127.0.0.1; liefert (Port, Stopp-Funktion)."""
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=folder, **k)
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1], srv.shutdown


def start(tb, profile, port):
    proc = ht.start_thunderbird(tb, profile)
    if not ht.wait_port(port):
        proc.kill()
        sys.exit("Thunderbird hat Marionette nicht geöffnet")
    time.sleep(8)
    m = ht.Marionette(port)
    m.cmd("WebDriver:SetTimeouts", {"script": 180000})
    # Mitschrift der Fehlerkonsole ab hier: merkt sich die Kennung unserer Erweiterung, solange sie installiert ist
    # (nach dem Deinstallieren wären Meldungen aus background.js & Co. sonst nicht mehr als unsere erkennbar)
    ht.konsole_start(m)
    return proc, m


def quit_normal(m, port, proc):
    """Beendet Thunderbird wie ein Nutzer (Datei > Beenden): Ordner-Datenbanken werden dabei geschrieben – das erzwungene
    Beenden von ht.stop_thunderbird lässt z. B. eine geänderte Sortierung im Sammelordner ungespeichert. Klappt es nicht
    binnen 60 s, doch erzwungen."""
    try:
        m.js("w.setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 100); return 1;")
        proc.wait(60)
    except Exception as e:  # gewollt: Marionette weg oder Zeit abgelaufen – dann wie bisher erzwungen
        print(f"Hinweis: normales Beenden gescheitert ({e}), erzwungen", flush=True)
        ht.stop_thunderbird(port, proc)


def konsole(m, wann, board=True):
    """Fehlerkonsole dieser Thunderbird-Sitzung – nur Warnung wie in halo_test.py (Zeilen „KONSOLE  …“), hält kein
    Release auf; release.sh übernimmt die Zusammenfassung in Marke und Bericht. Liest die Mitschrift aus start()."""
    try:
        res = ht.konsole_lesen(m)
        errors, notes = ht.konsole_bewerten(res)
        perrors, _ = ht.konsole_bewerten(ht.protokoll_lesen(m))  # Fehlerprotokoll der Erweiterung ebenso
        if board:
            ht.konsole_melden(errors, notes)
            ht.konsole_melden(perrors, [], "PROTOKOLL")
        else:  # Sitzung mit der alten, schon veröffentlichten Version: nur zur Kenntnis, nicht ins Board (nicht behebbar)
            for e in errors + perrors:
                print(f"Hinweis (alte Version/Update): {e}", flush=True)
        print(f"Fehlerkonsole ({wann}): {len(errors)} Fehler aus halo.spaces, {len(perrors)} im Fehlerprotokoll (nur Warnung), "
              f"Thunderbird selbst: {res.get('fremd')} Fehler", flush=True)
    except Exception as e:
        print(f"Hinweis: Fehlerkonsole ({wann}) nicht lesbar – {e}", flush=True)


def latest_release():
    """Version des letzten GitHub-Release (so prüft release.sh das Update, das Nutzer gerade bekommen)."""
    try:
        tag = json.loads(fetch(f"https://api.github.com/repos/{REPO}/releases/latest"))["tag_name"]
        return tag.lstrip("v")
    except (OSError, KeyError, ValueError):
        return "3.6.0"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="old", default=None,
                    help="Ausgangsversion aus den GitHub-Releases (Standard: das letzte veröffentlichte Release, ohne Netz 3.6.0)")
    ap.add_argument("--xpi", help="neues Paket (Standard: dist/halo-spaces-<Version aus manifest.json>.xpi)")
    ap.add_argument("--github", action="store_true", help="Update über das veröffentlichte updates.json auf GitHub statt lokal")
    ap.add_argument("--tb", default=ht.DEFAULT_TB, help="Thunderbird-Programm")
    ap.add_argument("--port", type=int, default=2852, help="Marionette-Port (Standard 2852)")
    ap.add_argument("--keep", action="store_true", help="Testprofil nicht löschen")
    args = ap.parse_args()
    if not args.old:
        args.old = latest_release()

    work = tempfile.mkdtemp(prefix="halo-update-")
    old = os.path.join(work, f"halo-spaces-{args.old}.xpi")
    try:  # öffentliche Release-Datei, ohne gh (auch in der CI)
        open(old, "wb").write(fetch(f"https://github.com/{REPO}/releases/download/v{args.old}/halo-spaces-{args.old}.xpi"))
    except OSError as e:
        sys.exit(f"Version {args.old} nicht geladen: {e}")

    stop_server = None
    if args.github:
        # wie bei Nutzern: das alte Paket fragt das veröffentlichte updates.json ab
        manifest = json.loads(fetch(f"https://raw.githubusercontent.com/{REPO}/main/updates.json"))
        newest = manifest["addons"][ht.ADDON_ID]["updates"][-1]
        target = newest["version"]
        print(f"GitHub bietet {target} an: {newest['update_link']}", flush=True)
        start_xpi = old
        new_hash = newest["update_hash"].split(":", 1)[1]
    else:
        new = args.xpi or os.path.join(ht.ROOT, "dist", f"halo-spaces-{json.load(open(os.path.join(ht.ROOT, 'extension', 'manifest.json')))['version']}.xpi")
        if not os.path.exists(new):
            sys.exit(f"{new} fehlt – zuerst ./build.sh")
        target = version_of(new)
        global EXPECT_CLEANUP
        with zipfile.ZipFile(new) as z:
            EXPECT_CLEANUP = all(k in z.read("api/implementation.js").decode("utf-8", "replace") for k in REMOVED_PREFS)
        site = os.path.join(work, "site")
        os.makedirs(site)
        shutil.copy(new, os.path.join(site, "new.xpi"))
        port, stop_server = serve(site)
        new_hash = sha256(new)
        json.dump({"addons": {ht.ADDON_ID: {"updates": [{
            "version": target, "update_link": f"http://127.0.0.1:{port}/new.xpi", "update_hash": f"sha256:{new_hash}",
            "applications": {"gecko": {"strict_min_version": "128.0"}}}]}}},
            open(os.path.join(site, "updates.json"), "w"))
        start_xpi = os.path.join(work, f"halo-spaces-{args.old}-lokal.xpi")
        with_update_url(old, start_xpi, f"http://127.0.0.1:{port}/updates.json")

    if sys.platform == "darwin":
        ht.wait_turn("mac")
    profile = ht.create_profile(start_xpi, args.port)
    with open(os.path.join(profile, "user.js"), "a") as f:
        # lokaler Server ohne https (nur ohne --github nötig)
        f.write('user_pref("extensions.checkUpdateSecurity", false);\n' if not args.github else "")
        # die eigene Update-Prüfung von halo.spaces beim Start nicht dazwischenfunken lassen: alte Versionen
        # haben dafür einen eigenen Schalter, neue prüfen höchstens alle 6 Stunden (gerade eben geprüft)
        f.write('user_pref("extensions.mailcards.autoUpdate", false);\n')
        # ebenso nicht die Hintergrund-Prüfung des Add-on-Managers (sonst spielt sie das Update beim Neustart vor
        # Schritt 2 schon ein); „Nach Updates suchen“ von Hand bleibt davon unberührt
        f.write('user_pref("extensions.update.enabled", false);\n')
        f.write(f'user_pref("extensions.mailcards.autoUpdateLast", {int(time.time())});\n')
    print(f"Update {args.old} → {target} · Profil {profile}", flush=True)

    results = []
    proc = None
    try:
        # 1. alte Version wie ein Nutzer: Begrüßung schließen, Einstellungen und Toolbar anpassen
        proc, m = start(args.tb, profile, args.port)
        before = m.js(r"""
          await wait(2000);
          for (const x of [...Services.wm.getEnumerator(null)]) if (x.location?.href.startsWith("resource://mailcards/about/halo.html")) x.close();
          const userPrefs = """ + json.dumps({**USER_PREFS, **REMOVED_PREFS}) + r""";
          for (const [k, v] of Object.entries(userPrefs)) {
            if (typeof v == "boolean") Services.prefs.setBoolPref(k, v);
            else Services.prefs.setStringPref(k, v);
          }
          // Toolbar angepasst: letztes Element der Mail-Toolbar entfernt
          const tbState = JSON.parse(Services.prefs.getStringPref("mail.unifiedtoolbar.state", "{}") || "{}");
          if (tbState.mail?.length) tbState.mail.pop();
          Services.prefs.setStringPref("mail.unifiedtoolbar.state", JSON.stringify(tbState));
          await wait(1500);
        """ + STATE_JS)
        ok = before.get("version") == args.old and before.get("active")
        results.append(("Ausgangslage: alte Version aktiv", ok, f"{before.get('version')} aktiv={before.get('active')}"))
        m.js(IDENTITY_JS)
        m.js(SORT_SETUP_JS)
        sort_want = m.js(SORT_JS)
        # 26 = byFlagged (nsMsgViewSortType); darunter nach Eingang, wie Thunderbird es in Konversationen setzt
        results.append(("Ausgangslage: All Inboxes nach Stern sortiert, mit Konversationen",
                        sort_want.get("view", [None])[0] == 26 and sort_want.get("threaded"), str(sort_want)))
        # earlyTheme wirkt erst ab dem nächsten Start (userChrome.css im Profil): wie beim Nutzer einmal neu starten,
        # bevor das Update kommt
        quit_normal(m, args.port, proc)
        proc = None
        proc, m = start(args.tb, profile, args.port)
        m.js("await wait(2000); return 1;")  # wie oben: Fenster fertig aufgebaut
        sort_check(results, m, "Neustart ohne Update", sort_want)

        # 2. Update über den Add-on-Manager (wie „Nach Updates suchen“)
        upd = m.js(r"""
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
          // Menüpunkt der alten Version markieren: nach dem Update muss es ein neuer sein
          for (const x of [...Services.wm.getEnumerator(null)]) { const it = x.document?.getElementById("mcHaloSpaces"); if (it) it.__mcAlt = true; }
          const found = await new Promise(done => addon.findUpdates({
            onUpdateAvailable: (a, install) => done({ install }),
            onNoUpdateAvailable: () => done({ none: true }),
            onUpdateFinished: (a, err) => err && done({ err }),
          }, AddonManager.UPDATE_WHEN_USER_REQUESTED));
          if (!found.install) return { found: false, err: found.err ?? null };
          const install = found.install;
          const ended = new Promise(done => install.addListener({
            onInstallEnded: () => done("ended"), onInstallFailed: () => done("failed " + install.error),
            onDownloadFailed: () => done("download failed " + install.error), onInstallCancelled: () => done("cancelled"),
          }));
          install.install();
          let postponedFlag = false;
          install.addListener({ onInstallPostponed: () => { postponedFlag = true; } });
          const how = await Promise.race([ended, wait(60000).then(() => "timeout"), new Promise(r => install.addListener({ onInstallPostponed: () => r("timeout") }))]);
          await wait(8000);  // neue Version startet, Fenster werden neu gestylt
          return { found: true, how, postponed: postponedFlag || install.state == AddonManager.STATE_POSTPONED };
        """)
        # ab 3.16 stellt halo.spaces ein gefundenes Update bis zum nächsten Start zurück („Install Now“ bzw.
        # beim Neustart) – dann gilt es erst nach dem Neustart unten
        postponed = upd.get("how") == "timeout" and upd.get("postponed")
        results.append(("Update gefunden und installiert (bzw. bis zum Neustart zurückgestellt)",
                        upd.get("found") and (upd.get("how") == "ended" or postponed), str(upd)))

        if not postponed:
            after = m.js(STATE_JS)
            compare(results, "nach dem Update", before, after, target)
        else:
            # „Install Now“ (bereiche.js installNow): zurückgestelltes Update ohne Neustart einspielen
            now = m.js(r"""
              const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
              const i = (await AddonManager.getAllInstalls()).find(x => (x.existingAddon?.id == "mail-cards@sebastian.local"
                || x.addon?.id == "mail-cards@sebastian.local") && x.state == AddonManager.STATE_POSTPONED);
              if (!i) return { found: false };
              const ended = new Promise(r => i.addListener({ onInstallEnded: () => r("ended"), onInstallFailed: () => r("failed") }));
              i.continuePostponedInstall();
              const how = await Promise.race([ended, wait(60000).then(() => "timeout")]);
              await wait(8000);  // neue Version startet, Fenster werden neu gestylt (wie oben)
              const a = await AddonManager.getAddonByID("mail-cards@sebastian.local");
              return { found: true, how, version: a?.version };
            """)
            results.append(("zurückgestelltes Update ohne Neustart eingespielt (Install Now)",
                            now.get("how") == "ended" and now.get("version") == target, str(now)))
        sidebar_check(results, m, "Update ohne Neustart")
        sort_check(results, m, "Update ohne Neustart", sort_want)
        if not args.github:  # mit --github liegt das neue Paket nicht lokal vor
            code_check(results, m, "Update ohne Neustart", new, old)
        recommend_check(results, m, "Update ohne Neustart")
        # alte Version und Update im laufenden Thunderbird (Abbau der alten, Start der neuen Version)
        konsole(m, "alte Version und Update im laufenden Thunderbird", board=False)
    finally:
        if proc:
            quit_normal(m, args.port, proc)

    # 3. Neustart: alles noch da?
    proc = None
    try:
        proc, m = start(args.tb, profile, args.port)
        restarted = m.js("await wait(2000);" + STATE_JS)
        compare(results, "nach Neustart", before, restarted, target)
        sidebar_check(results, m, "nach Neustart")
        sort_check(results, m, "nach Neustart", sort_want)
        if not args.github:
            code_check(results, m, "nach Neustart", new, old)
        recommend_check(results, m, "nach Neustart")

        # 4. Deaktivieren lässt die Einstellungen stehen, Deinstallieren räumt sie weg (selbst angepasste
        #    Toolbar bleibt)
        gone = m.js(r"""
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const ours = () => Services.prefs.getChildList("extensions.mailcards.").filter(n => Services.prefs.prefHasUserValue(n)).length;
          const toolbar = () => Services.prefs.getStringPref("mail.unifiedtoolbar.state", "");
          let addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
          await addon.disable(); await wait(2000);
          const out = { disabled: ours(), toolbar: toolbar() };
          await addon.enable(); await wait(4000);
          addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
          await addon.uninstall(); await wait(4000);
          out.uninstalled = ours(); out.toolbarKept = toolbar() == out.toolbar;
          out.left = Services.prefs.getChildList("extensions.mailcards.").filter(n => Services.prefs.prefHasUserValue(n));
          out.gone = !(await AddonManager.getAddonByID("mail-cards@sebastian.local"));
          return out;
        """)
        # Start der neuen Version (dort entstehen Fehler wie GitHub #38), Deaktivieren, Deinstallieren (Aufräumen)
        konsole(m, "Neustart, Deaktivieren, Deinstallieren")
        results.append(("Deaktivieren behält die Einstellungen", gone["disabled"] > 0, f"{gone['disabled']} Einträge"))
        results.append(("Deinstallieren entfernt alle extensions.mailcards.*, angepasste Toolbar bleibt",
                        gone["gone"] and gone["uninstalled"] == 0 and gone["toolbarKept"],
                        f"übrig {gone['uninstalled']} {gone.get('left') or ''}, Toolbar gleich={gone['toolbarKept']}"))
    finally:
        if proc:
            ht.stop_thunderbird(args.port, proc)
        if stop_server:
            stop_server()
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)
        shutil.rmtree(work, ignore_errors=True)

    if args.github:
        results.append(("Hash im veröffentlichten updates.json passt zum Release-Paket", check_github_hash(target, new_hash), new_hash[:16]))

    for name, ok, detail in results:
        print(f"{'OK    ' if ok else 'FEHLER'}  {name} – {detail}", flush=True)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} von {len(results)} Prüfungen OK" + (f", {len(failed)} FEHLER" if failed else ""))
    sys.exit(1 if failed else 0)


def compare(results, when, before, after, target):
    lost = {k: (v, after["prefs"].get(k)) for k, v in USER_PREFS.items() if after["prefs"].get(k) != v}
    results.append((f"Version {target} aktiv ({when})", after.get("version") == target and after.get("active"),
                    f"{after.get('version')} aktiv={after.get('active')}"))
    results.append((f"Einstellungen erhalten ({when})", not lost, f"verändert: {lost}" if lost else f"{len(USER_PREFS)} gleich"))
    if EXPECT_CLEANUP:
        left = {k: after["prefs"][k] for k in REMOVED_PREFS if k in after["prefs"]}
        results.append((f"Einstellungen entfernter Optionen aufgeräumt ({when})", not left,
                        f"übrig: {left}" if left else f"{len(REMOVED_PREFS)} entfernt"))
    results.append((f"angepasste Toolbar erhalten ({when})", after["toolbar"] == before["toolbar"],
                    after["toolbar"][:200] if after["toolbar"] != before["toolbar"] else "gleich"))
    results.append((f"Chat-Bereich wie gewohnt ({when})", after["chat"] and after["prefs"].get("extensions.mailcards.fifthSpace", "chat") == "chat",
                    f"Knopf={after['chat']} fifthSpace={after['prefs'].get('extensions.mailcards.fifthSpace', '(Standard)')}"))
    results.append((f"keine erneute Begrüßung ({when})", after["welcome"] == 0, f"Fenster offen: {after['welcome']}"))
    # earlyTheme an: die Datei im Profil trägt im Kopf die neue Version
    results.append((f"userChrome.css im Profil erneuert ({when})", f"Version {target} " in (after["css"] or ""), str(after["css"])[:120]))
    results.append((f"Design aktiv ({when})", after["themed"], f"mc-tab gesetzt={after['themed']}"))


def check_github_hash(version, expected):
    """Lädt das Release-Paket und vergleicht mit dem Hash aus updates.json (nur lesend)."""
    url = f"https://github.com/{REPO}/releases/download/v{version}/halo-spaces-{version}.xpi"
    data = fetch(url)
    return hashlib.sha256(data).hexdigest() == expected


if __name__ == "__main__":
    main()
