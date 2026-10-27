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
    "extensions.mailcards.inlinePrompts": False,
}

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
    return proc, m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="old", default="3.6.0", help="Ausgangsversion aus den GitHub-Releases (Standard 3.6.0)")
    ap.add_argument("--xpi", help="neues Paket (Standard: dist/halo-spaces-<Version aus manifest.json>.xpi)")
    ap.add_argument("--github", action="store_true", help="Update über das veröffentlichte updates.json auf GitHub statt lokal")
    ap.add_argument("--tb", default=ht.DEFAULT_TB, help="Thunderbird-Programm")
    ap.add_argument("--port", type=int, default=2852, help="Marionette-Port (Standard 2852)")
    ap.add_argument("--keep", action="store_true", help="Testprofil nicht löschen")
    args = ap.parse_args()

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
        # die eigene Update-Prüfung von halo.spaces beim Start nicht dazwischenfunken lassen
        f.write('user_pref("extensions.mailcards.autoUpdate", false);\n')
    print(f"Update {args.old} → {target} · Profil {profile}", flush=True)

    results = []
    proc = None
    try:
        # 1. alte Version wie ein Nutzer: Begrüßung schließen, Einstellungen und Toolbar anpassen
        proc, m = start(args.tb, profile, args.port)
        before = m.js(r"""
          await wait(2000);
          for (const x of [...Services.wm.getEnumerator(null)]) if (x.location?.href.startsWith("resource://mailcards/about/halo.html")) x.close();
          const userPrefs = """ + json.dumps(USER_PREFS) + r""";
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

        # 2. Update über den Add-on-Manager (wie „Nach Updates suchen“)
        upd = m.js(r"""
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
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
          const how = await Promise.race([ended, wait(60000).then(() => "timeout")]);
          await wait(8000);  // neue Version startet, Fenster werden neu gestylt
          return { found: true, how };
        """)
        results.append(("Update gefunden und installiert", upd.get("found") and upd.get("how") == "ended", str(upd)))

        after = m.js(STATE_JS)
        compare(results, "nach dem Update", before, after, target)
    finally:
        if proc:
            ht.stop_thunderbird(args.port, proc)

    # 3. Neustart: alles noch da?
    proc = None
    try:
        proc, m = start(args.tb, profile, args.port)
        restarted = m.js("await wait(2000);" + STATE_JS)
        compare(results, "nach Neustart", before, restarted, target)
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
