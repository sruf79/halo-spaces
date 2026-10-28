#!/usr/bin/env python3
"""Automatischer Test von halo.spaces in einem frischen, temporären Thunderbird-Profil.

Legt ein leeres Profil an (keine Konten, keine echten Daten), installiert das
gebaute Paket, startet Thunderbird mit Marionette und prüft die Stellen, an
denen es früher Rückschritte gab: Listenbreite, Toolbar-Kanten und Kapseln,
Wochenansicht, Schnellfenster, Emojis, Trennlinien (Ziehen/Doppelklick),
Status-Symbol in der Kalenderliste und das Fehlerprotokoll.

Aufruf:  python3 tests/halo_test.py [--xpi dist/…xpi] [--keep] [--dark] [--shots ORDNER] [--tb …]
         (ohne --xpi wird vorher ./build.sh ausgeführt)
Ergebnis: eine Zeile je Prüfung (OK/FEHLER), Rückgabewert 0 nur wenn alles OK ist.
"""

import argparse
import glob
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

ADDON_ID = "mail-cards@sebastian.local"
PORT = 2839
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# HALO_TB setzt einen anderen Thunderbird (z. B. ~/Applications, wenn /Applications nicht beschreibbar ist)
DEFAULT_TB = os.environ.get("HALO_TB") or {
    "darwin": "/Applications/Thunderbird.app/Contents/MacOS/thunderbird",
    "win32": r"C:\Program Files\Mozilla Thunderbird\thunderbird.exe",
}.get(sys.platform, "thunderbird")
# openssl für die lokalen HTTPS-Testserver; unter Windows aus Git für Windows (tests/win-vm-setup.ps1)
OPENSSL = shutil.which("openssl") or next((p for p in [r"C:\Program Files\Git\usr\bin\openssl.exe"] if os.path.exists(p)), None)

# Windows-VM auf dem Testrechner (Parallels, tests/MAC-MINI.md Abschnitt „Windows-VM“)
VM_NAME = os.environ.get("HALO_VM", "Windows 11")
VM_SHARE = os.path.expanduser("~/halo-vm")  # einzige Freigabe der VM, dort \\Mac\halo
VM_UNC = r"\\Mac\halo"
VM_PY = r"C:\Program Files\Python315-arm64\python.exe"
VM_TB = {"release": r"C:\Program Files\Mozilla Thunderbird\thunderbird.exe",
         "beta": r"C:\Program Files\Thunderbird Beta\thunderbird.exe"}
VM_LOCK = os.path.join(VM_SHARE, "lauf.lock")  # Mac- und Windows-Läufe nie gleichzeitig


class Marionette:
    def __init__(self, port, capabilities=None):
        self.sock = socket.create_connection(("127.0.0.1", port))
        # nie endlos warten: ein Befehl darf höchstens 11 Minuten dauern (--perf)
        self.sock.settimeout(660)
        self.id = 0
        self._read()
        self.cmd("WebDriver:NewSession", {"capabilities": capabilities or {}})
        self.cmd("Marionette:SetContext", {"value": "chrome"})

    def _recv(self, n):
        chunk = self.sock.recv(n)
        if not chunk:  # Thunderbird hat die Verbindung geschlossen (beendet/abgestürzt)
            raise ConnectionError("Marionette-Verbindung geschlossen")
        return chunk

    def _read(self):
        buf = b""
        while b":" not in buf:
            buf += self._recv(1)
        n, rest = buf.split(b":", 1)
        n = int(n)
        while len(rest) < n:
            rest += self._recv(n - len(rest))
        return json.loads(rest)

    def cmd(self, name, params=None):
        self.id += 1
        data = json.dumps([0, self.id, name, params or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b":" + data)
        reply = self._read()
        if reply[2]:
            raise RuntimeError(reply[2].get("message", reply[2]))
        return reply[3]

    def js(self, body):
        script = "return (async () => {" + PRELUDE + body + "})();"
        try:
            return self.cmd("WebDriver:ExecuteScript", {"script": script, "args": []}).get("value")
        except RuntimeError as e:
            # mit --only fehlen Vorarbeiten übersprungener Prüfungen – Vorbereitungen außerhalb einer Prüfung dürfen dann scheitern
            if ONLY and not IN_CHECK:
                print(f"Hinweis (--only): Vorbereitung übersprungen – {e}", flush=True)
                return {}
            raise

    def pointer(self, steps):
        self.cmd("WebDriver:PerformActions", {"actions": [
            {"type": "pointer", "id": "maus", "parameters": {"pointerType": "mouse"}, "actions": steps}]})
        self.cmd("WebDriver:ReleaseActions", {})


# gemeinsame Hilfen für alle Prüfungen (im Chrome-Kontext von Thunderbird)
PRELUDE = r"""
const w = Services.wm.getMostRecentWindow("mail:3pane"); const d = w.document;
const wait = ms => new Promise(r => w.setTimeout(r, ms));
// wartet, bis fn() etwas liefert (statt fester Wartezeiten – bei hoher Last zuverlässiger)
const until = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const v = fn(); if (v) return v; await wait(100); } return fn(); };
const tm = d.getElementById("tabmail");
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const toMail = async () => { tm.switchToTab(0); await wait(900); return tm.currentAbout3Pane; };
const toCalendar = async () => { tm.openTab("calendar", {}); await wait(1500); };
const testCalendar = () => cal.manager.getCalendars().find(c => c.name == "Halo Test");
const items = async title => { const c = testCalendar(); return (await c.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)).filter(i => i.title == title); };
const rect = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; };
"""


ONLY = None  # --only: nur Prüfungen, deren Name auf diesen regulären Ausdruck passt
IN_CHECK = False


def check(name, fn, results):
    global IN_CHECK
    if ONLY and not ONLY.search(name):
        return
    IN_CHECK = True
    try:
        ok, detail = fn()
    except Exception as e:  # Fehler in der Prüfung selbst zählen als Fehlschlag
        ok, detail = False, f"Ausnahme: {e}"
    finally:
        IN_CHECK = False
    results.append((name, ok, detail))
    print(f"{'OK     ' if ok else 'FEHLER '} {name}" + (f" – {detail}" if detail else ""), flush=True)


def wait_port(port, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            return True
        except OSError:
            time.sleep(0.5)
    return False


def local_https(host):
    """Lokaler HTTPS-Server (selbst signiert, für host) für die Netzprüfung der
    Absenderbilder, dazu ein „Gerät im lokalen Netz“ (http auf 127.0.0.1), das
    jeden Zugriff mitschreibt. Liefert Port, Zertifikat (DER, Base64), die
    Zugriffe aufs Gerät, die empfangenen POSTs und eine Funktion zum Beenden."""
    import base64
    import http.server
    import ssl
    import threading
    tmp = tempfile.mkdtemp(prefix="halo-netz-")
    key, crt = os.path.join(tmp, "key.pem"), os.path.join(tmp, "cert.pem")
    subprocess.run([OPENSSL, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "2",
                    "-subj", f"/CN={host}", "-addext", f"subjectAltName=DNS:{host}",
                    "-addext", "basicConstraints=critical,CA:FALSE"], check=True, capture_output=True)
    hits, posts, stop = [], [], threading.Event()

    class Device(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    class Sender(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/umleitung":  # Absender leitet auf ein Gerät im lokalen Netz um
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{device.server_port}/geraet")
                self.end_headers()
            elif self.path == "/weiter":  # Umleitung auf eine öffentliche Adresse bleibt erlaubt
                self.send_response(302)
                self.send_header("Location", f"https://{host}:{server.server_port}/ziel")
                self.end_headers()
            elif self.path == "/ziel":
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write("<head></head>Grüße".encode())
            elif self.path == "/anmelden":  # wie iCloud-Fotos: 401 ohne Anmeldedialog
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="Halo"')
                self.end_headers()
            elif self.path == "/endlos":  # Daten ohne Ende (höchstens 20 MB)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                try:
                    for _ in range(320):
                        self.wfile.write(b"x" * 65536)
                except OSError:
                    pass
            elif self.path == "/stumm":  # nach den Kopfzeilen kommt nichts mehr
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                self.wfile.write(b"x" * 10)
                self.wfile.flush()
                stop.wait(30)
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            posts.append(self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode())
            if self.path == "/abmelden-umleitung":  # Abmeldung leitet auf eine Bestätigungsseite im lokalen Netz um
                self.send_response(303)
                self.send_header("Location", f"http://127.0.0.1:{device.server_port}/bestaetigt")
                self.end_headers()
                return
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    device = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Device)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Sender)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(crt, key)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    for s in (device, server):
        s.daemon_threads = True
        threading.Thread(target=s.serve_forever, daemon=True).start()
    der = base64.b64encode(ssl.PEM_cert_to_DER_cert(open(crt).read())).decode()

    def close():
        stop.set()
        for s in (device, server):
            s.shutdown()
            s.server_close()
        shutil.rmtree(tmp, ignore_errors=True)
    return server.server_port, der, hits, posts, close


def create_profile(xpi, port, dark=False, prefix="halo-test-"):
    """Legt ein leeres, temporäres Profil mit installiertem Paket an (keine Konten, keine echten Daten)."""
    profile = tempfile.mkdtemp(prefix=prefix)
    os.makedirs(os.path.join(profile, "extensions"))
    shutil.copy(xpi, os.path.join(profile, "extensions", f"{ADDON_ID}.xpi"))
    with open(os.path.join(profile, "user.js"), "w") as f:
        for pref, value in {
            "extensions.autoDisableScopes": 0,
            "marionette.port": port,
            "mail.shell.checkDefaultClient": False,
            "mail.provider.suppress_dialog_on_startup": True,
            "mail.rights.version": 1,
            "app.update.enabled": False,
            "datareporting.policy.dataSubmissionPolicyBypassNotification": True,
            "toolkit.telemetry.reportingpolicy.firstRun": False,
            "calendar.timezone.useSystemTimezone": True,
            # Zeitgeber im Hintergrund nicht drosseln
            "widget.windows.window_occlusion_tracking.enabled": False,
            "dom.timeout.enable_budget_timer_throttling": False,
            "dom.min_background_timeout_value": 4,
            # das macOS-Adressbuch (echte Kontakte) nicht einbinden
            "ldap_2.servers.osx.position": 0,
            **({"ui.systemUsesDarkTheme": 1} if dark else {}),
        }.items():
            f.write(f"user_pref({json.dumps(pref)}, {json.dumps(value)});\n")
    return profile


def start_thunderbird(tb, profile, log=None):
    """Startet Thunderbird mit Marionette im angegebenen Profil."""
    out = open(log, "w") if log else subprocess.DEVNULL
    return subprocess.Popen([tb, "-profile", profile, "-no-remote", "-marionette", "-remote-allow-system-access"],
                            stdout=out, stderr=subprocess.STDOUT if log else subprocess.DEVNULL,
                            # ab Thunderbird 159 zusätzlich als Umgebungsvariable nötig
                            env={**os.environ, "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1"})


def stop_thunderbird(port, proc):
    """Beendet das Test-Thunderbird (nur den selbst gestarteten Prozess)."""
    try:
        Marionette(port).js("Services.startup.quit(Ci.nsIAppStartup.eForceQuit); return 1;")
    except Exception:
        pass
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()


def prl(*args, check=True, timeout=300):
    return subprocess.run(["prlctl", *args], capture_output=True, text=True, check=check, timeout=timeout)


def vm_exec(vm, *cmd, check=True, timeout=120):
    """Befehl in der angemeldeten Windows-Sitzung (Argumente ohne Anführungszeichen – prlctl gibt sie nicht weiter)."""
    return prl("exec", vm, "--current-user", *cmd, check=check, timeout=timeout)


def vm_state(vm):
    out = prl("status", vm, check=False).stdout.split()
    return out[-1] if out else "unbekannt"


def vm_ready(vm):
    """Setzt die VM fort bzw. startet sie und wartet auf die angemeldete Sitzung. Liefert den Zustand vorher."""
    before = vm_state(vm)
    if before in ("suspended", "paused"):
        print(f"VM „{vm}“ wird fortgesetzt …", flush=True)
        prl("resume", vm)
    elif before == "stopped":
        print(f"VM „{vm}“ wird gestartet …", flush=True)
        prl("start", vm)
    elif before != "running":
        sys.exit(f"VM „{vm}“ nicht gefunden oder im Zustand {before} (prlctl list -a)")
    end = time.time() + 240
    while time.time() < end:
        try:
            if vm_exec(vm, "cmd", "/c", "echo", "bereit", check=False, timeout=30).stdout.strip() == "bereit":
                return before
        except subprocess.TimeoutExpired:
            pass
        time.sleep(3)
    sys.exit(f"VM „{vm}“: keine angemeldete Windows-Sitzung (automatische Anmeldung prüfen)")


THEME_KEY = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"


def vm_theme(vm, values=None):
    """Liest bzw. setzt das Windows-Farbschema (AppsUseLightTheme/SystemUsesLightTheme, 1 = hell)."""
    names = ("AppsUseLightTheme", "SystemUsesLightTheme")
    if values is None:
        out = {}
        for n in names:
            m = re.search(r"0x([0-9a-f]+)", vm_exec(vm, "reg", "query", THEME_KEY, "/v", n, check=False).stdout)
            out[n] = int(m.group(1), 16) if m else 1
        return out
    for n in names:
        vm_exec(vm, "reg", "add", THEME_KEY, "/v", n, "/t", "REG_DWORD", "/d", str(values[n]), "/f")


def wait_turn(mine):
    """Wartet, bis kein Lauf der anderen Plattform mehr läuft (höchstens eine Stunde)."""
    def busy():
        if mine == "vm":  # Test-Thunderbird auf dem Mac
            return subprocess.run(["pgrep", "-f", "--", "-profile .*/halo-test-"], capture_output=True).returncode == 0
        try:
            pid = int(open(VM_LOCK).read().split()[0])
            os.kill(pid, 0)
            return True
        except (OSError, ValueError, IndexError):
            return False
    end, said = time.time() + 3600, False
    while busy():
        if time.time() > end:
            sys.exit("Abbruch: der andere Testlauf ist nach einer Stunde noch nicht fertig")
        if not said:
            print("Warte: es läuft ein Test " + ("auf dem Mac" if mine == "vm" else "in der Windows-VM") + " – Mac- und Windows-Läufe nie gleichzeitig …", flush=True)
            said = True
        time.sleep(10)


def run_in_vm(args, xpi):
    """Führt diesen Test in der Windows-VM aus: Dateien über die Freigabe, Python und Thunderbird in der VM,
    Marionette dort lokal (Port wie --port, nur in der VM erreichbar). Screenshots kommen zurück auf den Mac."""
    if not shutil.which("prlctl"):
        sys.exit("prlctl fehlt – Parallels Desktop (Pro) installieren")
    vm = args.vm
    os.makedirs(VM_SHARE, exist_ok=True)
    wait_turn("vm")
    with open(VM_LOCK, "w") as f:
        f.write(f"{os.getpid()} {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    run = tempfile.mkdtemp(prefix="lauf-", dir=VM_SHARE)
    win = VM_UNC + "\\" + os.path.basename(run)
    before = theme = None
    try:
        os.makedirs(os.path.join(run, "tests"))
        for f in ("halo_test.py", "testserver.py", "perf.js", "win-display.ps1"):
            shutil.copy(os.path.join(ROOT, "tests", f), os.path.join(run, "tests", f))
        # manifest.json und Stilblätter (z. B. options/options.css) lesen einzelne Prüfungen direkt
        shutil.copytree(os.path.join(ROOT, "extension"), os.path.join(run, "extension"))
        shutil.copy(xpi, os.path.join(run, os.path.basename(xpi)))
        inner = {"xpi": win + "\\" + os.path.basename(xpi), "tb": VM_TB["beta" if args.beta else "release"] if args.tb == DEFAULT_TB else args.tb,
                 "port": args.port, "dark": args.dark, "keep": args.keep, "only": args.only, "eval": args.eval, "perf": args.perf,
                 "tb_log": win + "\\thunderbird.log" if args.tb_log else None,
                 "shots": win + "\\shots" if args.shots else None, "compare": None}
        if args.compare:
            shutil.copytree(args.compare, os.path.join(run, "vorher"))
            inner["compare"] = win + "\\vorher"
        json.dump(inner, open(os.path.join(run, "args.json"), "w"))

        before = vm_ready(vm)
        print(f"Windows-VM „{vm}“ (vorher {before}) · {inner['tb']}", flush=True)
        # Bildschirm 1920 × 1080 (ohne Fenster der VM wählt Parallels 1024 × 768)
        vm_exec(vm, "powershell", "-ExecutionPolicy", "Bypass", "-File", win + "\\tests\\win-display.ps1", win + "\\display.txt", check=False)
        try:
            shown = open(os.path.join(run, "display.txt")).read().split()
            if len(shown) == 3 and (int(shown[1]) < 1600 or int(shown[2]) < 1000):
                print(f"HINWEIS Bildschirm der VM nur {shown[1]} × {shown[2]} – Skalierung 100 %? (tests/win-vm-setup.ps1 -Benutzer)", flush=True)
        except (OSError, ValueError):
            print("HINWEIS Bildschirmgröße der VM unbekannt", flush=True)
        theme = vm_theme(vm)
        want = 0 if args.dark else 1
        if set(theme.values()) != {want}:
            vm_theme(vm, {k: want for k in theme})
            time.sleep(3)  # Windows färbt Fensterrahmen und Taskleiste um
        proc = subprocess.Popen(["prlctl", "exec", vm, "--current-user", VM_PY, "-u", win + "\\tests\\halo_test.py",
                                 "--vm-args", win + "\\args.json"])
        try:
            rc = proc.wait(timeout=3600)
        except subprocess.TimeoutExpired:
            proc.kill()
            vm_exec(vm, "taskkill", "/f", "/im", "thunderbird.exe", check=False)
            rc = 1
            print("FEHLER  Testlauf in der VM nach einer Stunde abgebrochen", flush=True)
        if args.shots and os.path.isdir(os.path.join(run, "shots")):
            shutil.copytree(os.path.join(run, "shots"), args.shots, dirs_exist_ok=True)
        if args.tb_log and os.path.exists(os.path.join(run, "thunderbird.log")):
            shutil.copy(os.path.join(run, "thunderbird.log"), args.tb_log)
        return rc
    finally:
        try:
            if theme and before:
                try:
                    vm_theme(vm, theme)
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                    print(f"HINWEIS Farbschema der VM nicht zurückgestellt: {e}", flush=True)
            # Speicher für die macOS-Tests freigeben: VM nach dem Lauf pausieren (--vm-weiter: laufen lassen)
            if before and not args.vm_weiter and vm_state(vm) == "running":
                prl("suspend", vm, check=False)
        finally:
            shutil.rmtree(run, ignore_errors=True)
            os.remove(VM_LOCK)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xpi", help="Paket (Standard: neuestes dist/halo-spaces-*.xpi)")
    ap.add_argument("--tb", default=DEFAULT_TB, help="Thunderbird-Programm")
    ap.add_argument("--keep", action="store_true", help="Testprofil nicht löschen")
    ap.add_argument("--tb-log", help="Ausgabe von Thunderbird in diese Datei schreiben (zur Fehlersuche)")
    ap.add_argument("--dark", action="store_true", help="im Dunkelmodus starten")
    ap.add_argument("--shots", help="Ordner für Screenshots aller Bereiche")
    ap.add_argument("--eval", help="nur dieses JavaScript ausführen (Chrome-Kontext, mit den Hilfen aus PRELUDE) und das Ergebnis ausgeben – zum Untersuchen")
    ap.add_argument("--perf", action="store_true", help="nur die Geschwindigkeit messen (5000 Mails, mit und ohne halo.spaces)")
    ap.add_argument("--port", type=int, default=PORT, help=f"Marionette-Port (Standard {PORT}; eigener Port erlaubt mehrere Testläufe gleichzeitig)")
    ap.add_argument("--compare", help="Ordner mit früheren Screenshots: zeigt, wo sich etwas verändert hat (braucht --shots)")
    ap.add_argument("--only", help="nur Prüfungen, deren Name auf diesen regulären Ausdruck passt (z. B. \"Anhänge\")")
    ap.add_argument("--vm", nargs="?", const=VM_NAME, help=f"in der Windows-VM testen (Parallels, Standard „{VM_NAME}“, sonst $HALO_VM); "
                    "danach wird die VM pausiert")
    ap.add_argument("--beta", action="store_true", help="mit --vm: Thunderbird Beta der VM")
    ap.add_argument("--vm-weiter", action="store_true", help="mit --vm: VM nach dem Lauf nicht pausieren")
    ap.add_argument("--vm-args", help=argparse.SUPPRESS)  # in der VM: Optionen aus der Datei (prlctl reicht keine Anführungszeichen weiter)
    args = ap.parse_args()
    if args.vm_args:
        for k, v in json.load(open(args.vm_args)).items():
            setattr(args, k, v)
    if args.only:
        global ONLY
        ONLY = re.compile(args.only, re.I)

    if not args.xpi:
        # ohne Angabe immer den aktuellen Stand bauen (sonst testet man ein altes Paket)
        built = subprocess.run([os.path.join(ROOT, "build.sh")], capture_output=True, text=True, cwd=ROOT)
        if built.returncode != 0:
            sys.exit("build.sh fehlgeschlagen:\n" + built.stderr)
    xpi = args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")),
                           key=os.path.getmtime, default=None)  # nicht die Store-Variante (ohne update_url)
    if not xpi or not os.path.exists(xpi):
        sys.exit("Kein Paket gefunden – zuerst ./build.sh")
    version = json.load(open(os.path.join(ROOT, "extension", "manifest.json")))["version"]
    if args.vm:
        sys.exit(run_in_vm(args, xpi))
    if sys.platform == "darwin":
        wait_turn("mac")

    profile = create_profile(xpi, args.port, args.dark)
    print(f"halo.spaces {version} · Paket {os.path.basename(xpi)} · Profil {profile}", flush=True)
    if args.vm_args:  # in der VM: welche Thunderbird-Version (application.ini neben dem Programm)
        ini = os.path.join(os.path.dirname(args.tb), "application.ini")
        tbv = re.search(r"^Version=(.+)$", open(ini).read(), re.M) if os.path.exists(ini) else None
        print(f"Windows {platform.version()} · Thunderbird {tbv.group(1) if tbv else '?'}", flush=True)
    proc = start_thunderbird(args.tb, profile, args.tb_log)
    results = []
    try:
        if not wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)  # Erweiterung und Fenster fertig aufbauen lassen
        m = Marionette(args.port)
        if args.perf:
            args.eval = open(os.path.join(ROOT, "tests", "perf.js")).read()
        if args.eval:
            m.cmd("WebDriver:SetTimeouts", {"script": 600000})
            print(json.dumps(m.js(args.eval), indent=1, ensure_ascii=False))
            return
        run_checks(m, version, profile, results)
        if args.shots:
            take_shots(m, args.shots, "dark" if args.dark else "light")
            if args.compare:
                compare_shots(m, args.compare, args.shots)
    finally:
        stop_thunderbird(args.port, proc)
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} von {len(results)} Prüfungen OK" + (f", {len(failed)} FEHLER" if failed else ""))
    sys.exit(1 if failed else 0)


def take_shots(m, folder, scheme):
    """Screenshots aller Bereiche (Testprofil, keine echten Daten)."""
    import base64
    os.makedirs(folder, exist_ok=True)
    for name, js in [
        ("mail", "await toMail();"),
        ("message", MESSAGE_JS),
        # Aktionen beim Überfahren (Kapsel unter dem Mailkopf) – :hover festgehalten
        ("message-hover", MESSAGE_JS + """const hd = tm.currentAbout3Pane.messageBrowser.contentDocument;
          hd.getElementById("mcHoverActions")?.style.setProperty("transition", "none");
          InspectorUtils.addPseudoClassLock(hd.documentElement, ":hover");"""),
        ("message-remote", """const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs"); await toMail();
          const hd = tm.currentAbout3Pane.messageBrowser.contentDocument; InspectorUtils.clearPseudoClassLocks(hd.documentElement);
          hd.getElementById("mcHoverActions")?.style.removeProperty("transition"); const f = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Schrift");
          const a3 = tm.currentAbout3Pane; a3.displayFolder(f.URI); await wait(800);
          for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).subject == "Schrift 1") a3.threadTree.selectedIndex = i;
          await wait(6000);"""),
        ("mail-1280", "w.resizeTo(1280, 900); await wait(1200); await toMail();"),
        ("calendar-week", 'await toCalendar(); w.switchToView("week"); await wait(800);'),
        ("calendar-month", 'await toCalendar(); w.switchToView("month"); await wait(800);'),
        ("tasks", 'tm.openTab("tasks", {}); await wait(1500);'),
        ("addressbook", 'tm.openTab("addressBookTab", {}); await wait(2000);'),
        ("addressbook-edit", ADDRESS_EDIT_JS),
        ("settings", "w.openPreferencesTab(); await wait(2000);"),
        ("addon-settings", f'w.openAddonsMgr("addons://detail/" + encodeURIComponent("{ADDON_ID}") + "/preferences"); await wait(3000);'),
    ]:
        m.js(("" if "resizeTo" in js else "w.resizeTo(1500, 900); ") + js + " await wait(600); return 1;")
        data = m.cmd("WebDriver:TakeScreenshot", {})["value"]
        path = os.path.join(folder, f"{scheme}-{name}.png")
        open(path, "wb").write(base64.b64decode(data))
        print(f"Screenshot {path}", flush=True)
    # eigene Fenster: Verfassen und Termin-Dialog
    for name, js in [
        ("compose", COMPOSE_JS),
        ("event-dialog", 'await toCalendar(); w.switchToView("week"); w.createEventWithDialog(null, null, null, "Halo Dialog"); await wait(2500); return 1;'),
        ("calendar-properties", 'w.openDialog("chrome://calendar/content/calendar-properties-dialog.xhtml", "_blank", "centerscreen,chrome,titlebar,resizable", { calendar: testCalendar() }); await wait(2000); return 1;'),
    ]:
        handles = lambda: (lambda r: r["value"] if isinstance(r, dict) else r)(m.cmd("WebDriver:GetWindowHandles"))
        main = (lambda r: r["value"] if isinstance(r, dict) else r)(m.cmd("WebDriver:GetWindowHandle"))
        before = set(handles())
        m.js(js)
        new = [h for h in handles() if h not in before]
        if not new:
            print(f"Screenshot {name}: kein Fenster", flush=True)
            continue
        m.cmd("WebDriver:SwitchToWindow", {"handle": new[0]})
        m.cmd("WebDriver:ExecuteScript", {"script": "window.resizeTo(900, 700); return new Promise(r => setTimeout(r, 800));", "args": []})
        data = m.cmd("WebDriver:TakeScreenshot", {})["value"]
        path = os.path.join(folder, f"{scheme}-{name}.png")
        open(path, "wb").write(base64.b64decode(data))
        print(f"Screenshot {path}", flush=True)
        m.cmd("WebDriver:ExecuteScript", {"script": "window.close(); return 1;", "args": []})
        m.cmd("WebDriver:SwitchToWindow", {"handle": main})


# Testkontakt (example.invalid) im persönlichen Adressbuch anlegen und bearbeiten
ADDRESS_EDIT_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  if (!book.childCards.some(c => c.displayName == "Anna Beispiel")) {
    const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    for (const [k, v] of Object.entries({ FirstName: "Anna", LastName: "Beispiel", Company: "Beispiel GmbH", JobTitle: "Leitung", WorkPhone: "+43 1 234" })) c.setProperty(k, v);
    c.displayName = "Anna Beispiel"; c.primaryEmail = "anna@example.invalid"; book.addCard(c);
  }
  tm.openTab("addressBookTab", {}); await wait(2000);
  const ab = tm.currentTabInfo.browser.contentWindow; const ad = ab.document;
  const list = ad.getElementById("cards");
  list.selectedIndex = [...Array(list.view.rowCount).keys()].find(k => list.view.getCardFromRow(k)?.displayName == "Anna Beispiel");
  await wait(800);
  ad.getElementById("editButton").click(); await wait(1200);
"""


# eine Test-Mail (example.invalid) in Local Folders öffnen – für die Leseansicht
MESSAGE_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const root = MailServices.accounts.localFoldersServer.rootFolder;
  if (!root.containsChildNamed("Lesen")) { root.createSubfolder("Lesen", null); await wait(800); }
  const f = root.getChildNamed("Lesen");
  if (!f.getTotalMessages(false)) {
    f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(unescape(encodeURIComponent("From - Sat Oct 17 10:00:00 2026\r\nFrom: Anna Beispiel <anna@example.invalid>\r\nTo: Halo Test <halo@example.invalid>\r\nCc: Ben Muster <ben@example.invalid>\r\nSubject: Treffen am Donnerstag\r\nDate: Sat, 17 Oct 2026 09:41:00 +0200\r\nMessage-ID: <halo-read@example.invalid>\r\nList-ID: Halo Neuigkeiten <news.example.invalid>\r\nList-Unsubscribe: <https://example.invalid/abmelden?id=1>, <mailto:abmelden@example.invalid?subject=unsubscribe>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nHallo,\r\n\r\npasst dir Donnerstag um 10 Uhr? Ich bringe die Unterlagen mit.\r\n\r\nLiebe Grüße\r\nAnna\r\n")));
    await wait(800);
  }
  const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
  a3.threadTree.selectedIndex = 0; await wait(2000);"""


# Verfassen-Fenster mit einer reinen Test-Identität (example.invalid, kein Server)
COMPOSE_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
  if (!acc.identities.length) {
    const id = MailServices.accounts.createIdentity();
    id.fullName = "Halo Test"; id.email = "halo@example.invalid";
    acc.addIdentity(id);
  }
  const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
  const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
  fields.to = "Anna Beispiel <anna@example.invalid>"; fields.subject = "Halo Entwurf";
  fields.body = "<p>Hallo Anna,</p><p>das ist ein Testentwurf.</p>";
  params.composeFields = fields; params.identity = acc.identities[0]; params.format = Ci.nsIMsgCompFormat.HTML;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  await wait(3000); return 1;"""


def compare_shots(m, before, after):
    """Vergleicht Screenshots Pixel für Pixel (in Thunderbird selbst, ohne Bildbibliothek).

    Nur zur Information, kein Fehlschlag: Tagesdatum, Uhrzeit und „in 18 min“
    ändern sich von selbst. Für jede Abweichung entsteht ein Bild …-diff.png,
    in dem die geänderten Stellen rot markiert sind.
    """
    import base64
    print("\nVergleich mit", before, flush=True)
    for path in sorted(glob.glob(os.path.join(after, "*.png"))):
        name = os.path.basename(path)
        if name.endswith("-diff.png"):
            continue
        old = os.path.join(before, name)
        if not os.path.exists(old):
            print(f"  neu       {name}", flush=True)
            continue
        res = m.js(f"""
          const load = async p => createImageBitmap(new w.Blob([await IOUtils.read(p)], {{ type: "image/png" }}));
          const [a, b] = [await load({json.dumps(os.path.abspath(old))}), await load({json.dumps(os.path.abspath(path))})];
          if (a.width != b.width || a.height != b.height) return {{ size: [a.width, a.height, b.width, b.height] }};
          const pixels = img => {{ const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = img.width; c.height = img.height;
                                  const x = c.getContext("2d"); x.drawImage(img, 0, 0); return [c, x, x.getImageData(0, 0, c.width, c.height)]; }};
          const [, , pa] = pixels(a); const [cb, xb, pb] = pixels(b);
          const A = pa.data, B = pb.data, out = pb;
          let changed = 0, l = 1e9, t = 1e9, r = -1, bo = -1;
          for (let i = 0; i < A.length; i += 4) {{
            const diff = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
            if (diff > 40) {{
              changed++; const p = i / 4, px = p % b.width, py = (p - px) / b.width;
              l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); bo = Math.max(bo, py);
              out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0;
            }} else {{
              // unverändert: blass, damit die roten Stellen auffallen
              for (const k of [0, 1, 2]) out.data[i + k] = 255 - (255 - B[i + k]) * 0.25;
            }}
          }}
          if (!changed) return {{ changed: 0 }};
          xb.putImageData(out, 0, 0);
          return {{ changed: changed / (b.width * b.height), box: [l, t, r, bo], png: cb.toDataURL("image/png") }};""")
        if "size" in res:
            print(f"  Größe     {name}: {res['size'][0]}×{res['size'][1]} → {res['size'][2]}×{res['size'][3]}", flush=True)
        elif not res["changed"]:
            print(f"  gleich    {name}", flush=True)
        else:
            diff = path[:-4] + "-diff.png"
            open(diff, "wb").write(base64.b64decode(res["png"].split(",", 1)[1]))
            l, t, r, b = res["box"]
            print(f"  geändert  {name}: {res['changed'] * 100:.2f} % der Fläche, Bereich x {l}–{r}, y {t}–{b} → {os.path.basename(diff)}", flush=True)


# Mailliste: eigene Ordner mit erfundenen Mails (example.invalid) – Konversation
# (Wurzel gelesen, neuere Antwort ungelesen), Schlagwörter, verschiedene Tage,
# „Gesendet-Test“ mit Gesendet-Merkmal; dazu Hilfen für Farben und Kontrast
MAILLIST_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const root = MailServices.accounts.localFoldersServer.rootFolder;
  const pad = n => String(n).padStart(2, "0");
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const rfc = dt => { const o = -dt.getTimezoneOffset();
    return `${DAYS[dt.getDay()]}, ${pad(dt.getDate())} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:00 ${o >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(o) / 60))}${pad(Math.abs(o) % 60)}`; };
  // vor „days“ Tagen um h Uhr (heute höchstens 10 Minuten vor jetzt)
  const ago = (days, h) => { const dt = new Date(); dt.setDate(dt.getDate() - days); dt.setHours(h, 0, 0, 0); if (dt > new Date()) dt.setTime(Date.now() - 600000); return dt; };
  const raw = o => unescape(encodeURIComponent([`From: ${o.from}`, `To: ${o.to || "Halo Test <halo@example.invalid>"}`, `Subject: ${o.subject}`,
    `Date: ${rfc(o.date)}`, `Message-ID: <${o.id}@example.invalid>`, ...(o.ref ? [`In-Reply-To: <${o.ref}@example.invalid>`, `References: <${o.ref}@example.invalid>`] : []),
    "Content-Type: text/plain; charset=UTF-8", "", "Erfundene Testnachricht.", ""].join("\r\n")));
  const folder = async (name, mails, flag = 0) => {
    if (!root.containsChildNamed(name)) { root.createSubfolder(name, null); await wait(800); }
    const f = root.getChildNamed(name);
    if (flag) f.setFlag(flag);
    if (!f.getTotalMessages(false)) {
      const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
      for (const o of mails) lf.addMessage(raw(o));
      await wait(800);
      for (const o of mails) { const h = f.msgDatabase.getMsgHdrForMessageID(`${o.id}@example.invalid`); if (!h) continue;
        if (o.read) f.markMessagesRead([h], true); if (o.tag) f.addKeywordsToMessages([h], o.tag); }
      await wait(300);
    }
    return f;
  };
  const list = await folder("Mailliste", [
    { id: "halo-ml-1", from: "Ben Muster <ben@example.invalid>", subject: "Halo Faden", date: ago(3, 9), read: true },
    { id: "halo-ml-2", from: "Carla Ölmann <carla@example.invalid>", subject: "Re: Halo Faden", date: ago(2, 9), ref: "halo-ml-1" },
    { id: "halo-ml-3", from: "Dana Zöllner <dana@example.invalid>", subject: "Halo Schlagwort To Do", date: ago(0, 8), read: true, tag: "$label4" },
    { id: "halo-ml-4", from: "Frieda Lang <frieda@example.invalid>", subject: "Halo Schlagwort Work", date: ago(1, 9), read: true, tag: "$label2" },
    { id: "halo-ml-5", from: "Emil Kurz <emil@example.invalid>", subject: "Halo Ungelesen", date: ago(5, 9) },
    { id: "halo-ml-6", from: "Gustav Weit <gustav@example.invalid>", subject: "Halo Alt", date: ago(20, 9), read: true },
  ]);
  const sent = await folder("Gesendet-Test", [{ id: "halo-ml-sent", from: "Halo Test <halo@example.invalid>", to: "Anna Beispiel <anna@example.invalid>",
    subject: "Halo Gesendet", date: ago(1, 10), read: true }], Ci.nsMsgFolderFlags.SentMail);
  const a3 = await toMail(); const ad = a3.document;
  const cmd = name => a3.commandController.doCommand(name);
  const cs = (el, pseudo) => a3.getComputedStyle(el, pseudo);
  const showFolder = async (f = list) => { if (a3.gFolder?.URI != f.URI) { a3.displayFolder(f.URI); await until(() => a3.gFolder?.URI == f.URI && a3.gDBView, 6000); await wait(900); } };
  const cards = () => [...ad.querySelectorAll('#threadTree tr[is="thread-card"]')];
  const tableRows = () => [...ad.querySelectorAll('#threadTree tr[is="thread-row"]')];
  const props = r => (r.dataset.properties || "").split(" ");
  const subjectOf = r => r.querySelector(".subject, .subject-line span")?.textContent || "";
  // Farben: rgb()/rgba() und color(srgb …) auf 0–255, dazu die Deckkraft
  const rgba = c => { const v = (String(c).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = String(c).startsWith("color(") ? 255 : 1;
    return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
  const over = (fg, bg) => fg.slice(0, 3).map((x, i) => x * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  const same = (a, b) => { const [x, y] = [rgba(a), rgba(b)]; return x.every((v, i) => Math.abs(v - y[i]) <= (i == 3 ? 0.02 : 2)); };
  const accent = (() => { const e = ad.createElement("div"); e.style.color = "AccentColor"; ad.body.append(e); const c = cs(e).color; e.remove(); return c; })();
  const asCards = async () => { if (Services.prefs.getIntPref("mail.threadpane.listview", 0) != 0) { cmd("cmd_threadPaneViewCards"); await wait(1000); } };
  const asTable = async () => { if (Services.prefs.getIntPref("mail.threadpane.listview", 0) != 1) { cmd("cmd_threadPaneViewTable"); await wait(1200); } };"""


def maillist_checks(m, results):
    """Mailliste: Gruppenköpfe, Konversationen, Gesendet, Tabelle, Schlagwörter, Schnellfilter, Layouts, Konto-Startseite."""

    def group_headers():
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards();
          const v = a3.gViewWrapper; v.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
          v.showGroupedBySort = true; await wait(1200);
          const heads = await until(() => { const h = cards().filter(r => props(r).includes("dummy")); return h.length >= 2 && h; }, 8000) || [];
          const out = heads.map(r => {
            const c = r.querySelector(".card-container").getBoundingClientRect();
            const main = r.querySelector(".card-container > .thread-card-column:not(.read-status-column)");
            const box = r.querySelector(".thread-card-subject-container"), sub = r.querySelector(".subject"), det = r.querySelector(".sort-header-details");
            return { title: sub.textContent, cut: box.scrollWidth > box.clientWidth + 1 || sub.getBoundingClientRect().right > box.getBoundingClientRect().right + 1,
                     main: Math.round(main.getBoundingClientRect().width / c.width * 100), avatar: cs(r.querySelector(".mc-avatar")).display,
                     detailsInside: det.getBoundingClientRect().right <= c.right + 1, weight: cs(sub).fontWeight, detailSize: cs(det).fontSize };
          });
          v.showGroupedBySort = false; v.showThreaded = true; await wait(800);
          return out;""")
        ok = len(res) >= 2 and all(not h["cut"] and h["main"] >= 60 and h["avatar"] == "none" and h["detailsInside"]
                                   and int(h["weight"]) >= 600 and h["detailSize"] == "11px" for h in res)
        return ok, f"{res}"
    check("Mailliste: Gruppenköpfe (Heute, Gestern …) ganz lesbar, halbfett, ohne Absenderbild", group_headers, results)

    def group_headers_table():
        # Tabelle gruppiert: Gruppenköpfe laufen über die leeren Nachbarzellen,
        # die Zählung „(ungelesen/gesamt)“ bleibt sichtbar (früher „Gestern (1…“)
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asTable();
          const v = a3.gViewWrapper; v.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
          v.showGroupedBySort = true; await wait(1200);
          const out = [];
          try {
            const heads = await until(() => { const h = tableRows().filter(r => props(r).includes("dummy")); return h.length >= 2 && h; }, 8000) || [];
            const tree = ad.getElementById("threadTree").getBoundingClientRect();
            for (const r of heads) {
              const td = r.querySelector("td.subjectcol-column"), line = td.querySelector(".subject-line"), span = line.querySelector("span");
              const rg = ad.createRange(); rg.selectNodeContents(span); const t = rg.getBoundingClientRect();
              // jede Ebene zwischen Text und Zelle: entweder sichtbar überlaufend oder breit genug
              const clip = []; for (let e = span; e && e != r; e = e.parentElement) {
                const c = cs(e); if ((c.overflowX != "visible" || c.textOverflow == "ellipsis") && e.getBoundingClientRect().right < t.right - 1) clip.push(e.className || e.localName); }
              // Nachbarzellen unter dem überlaufenden Text: ohne eigene Fläche, die ihn verdecken könnte
              const cover = [...r.children].filter(c => c != td && !c.hidden && rgba(cs(c).backgroundColor)[3] > 0)
                .filter(c => { const b = c.getBoundingClientRect(); return b.right > t.left && b.left < t.right; }).map(c => c.className);
              out.push({ text: span.textContent, clip, cover, right: Math.round(t.right), treeRight: Math.round(tree.right), weight: cs(line).fontWeight });
            }
          } finally { v.showGroupedBySort = false; v.showThreaded = true; await wait(800); }
          return out;""")
        # Zählung „(n)“ bzw. „(ungelesen/gesamt)“; mindestens ein Kopf mit Ungelesenem
        ok = (len(res) >= 2 and any("/" in h["text"] for h in res)
              and all(not h["clip"] and not h["cover"] and h["right"] <= h["treeRight"] and re.search(r"\(\d+(/\d+)?\)$", h["text"])
                      and int(h["weight"]) >= 600 for h in res))
        return ok, f"{res}"
    check("Mailliste: Gruppenköpfe der Tabelle ganz lesbar samt Zählung, halbfett", group_headers_table, results)

    def card_alignment():
        # Betreff bündig mit Absender und Vorschau (früher 3 px eingerückt durch
        # Thunderbirds column-gap); Konversation: Abstand zum Thread-Knopf;
        # mit Stern: Abstand zwischen Betreff und Symbolen – je Dichte
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); a3.gViewWrapper.showThreaded = true; await wait(600); cmd("cmd_collapseAllThreads"); await wait(800);
          const hdr = list.msgDatabase.getMsgHdrForMessageID("halo-ml-4@example.invalid"); list.markMessagesFlagged([hdr], true); await wait(600);
          const L = (r, sel) => r.querySelector(sel).getBoundingClientRect();
          const out = {};
          try {
            for (const density of [0, 1, 2]) {
              Services.prefs.setIntPref("mail.uidensity", density); await wait(1200);
              const single = await until(() => cards().find(r => !r.classList.contains("children") && !props(r).includes("dummy")
                                                          && subjectOf(r).includes("Halo Ungelesen") && r.querySelector(".mc-preview")?.textContent), 6000);
              const conv = cards().find(r => r.classList.contains("children") && r.classList.contains("collapsed") && subjectOf(r).includes("Halo Faden"));
              const star = cards().find(r => subjectOf(r).includes("Halo Schlagwort Work"));
              if (!single || !conv || !star) { out[density] = { fehlt: [!!single, !!conv, !!star] }; continue; }
              // Anfang des Textes (nicht der Kästen – Absender und Vorschau haben Innenabstand)
              const T = (r, sel) => { const g = ad.createRange(); g.selectNodeContents(r.querySelector(sel)); return g.getBoundingClientRect(); };
              const sn = T(single, ".sender").left;
              const sub = L(star, ".subject"), icons = L(star, ".thread-card-icon-info");
              out[density] = { subject: Math.round(T(single, ".subject").left - sn), preview: Math.round(T(single, ".mc-preview").left - sn),
                               twisty: Math.round(L(conv, ".thread-card-subject-container").left - L(conv, "button.twisty").right),
                               icons: icons.width > 0 ? Math.round(icons.left - sub.right) : null };
            }
          } finally {
            Services.prefs.clearUserPref("mail.uidensity"); list.markMessagesFlagged([hdr], false); await wait(1000);
          }
          // gruppiert nach Sortierung: Karten unter einem Gruppenkopf (thread-children)
          // verlieren sonst Thunderbirds Einzug des Absenders – Betreff/Vorschau 3 px rechts davon
          const v = a3.gViewWrapper; v.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
          v.showGroupedBySort = true; await wait(1200); cmd("cmd_expandAllThreads"); await wait(1200);
          try {
            const g = await until(() => cards().find(r => !props(r).includes("dummy") && props(r).includes("thread-children")
                                                      && r.querySelector(".mc-preview")?.textContent), 8000);
            if (!g) out.gruppiert = { fehlt: true };
            else {
              const T = sel => { const rg = ad.createRange(); rg.selectNodeContents(g.querySelector(sel)); return rg.getBoundingClientRect().left; };
              const sn = T(".sender");
              out.gruppiert = { subject: +(T(".subject") - sn).toFixed(2), preview: +(T(".mc-preview") - sn).toFixed(2) };
            }
          } finally { v.showGroupedBySort = false; v.showThreaded = true; await wait(800); cmd("cmd_collapseAllThreads"); await wait(800); }
          return out;""")
        grp = res.get("gruppiert", {})
        dens = [v for k, v in res.items() if k != "gruppiert"]
        ok = (len(dens) == 3 and all("fehlt" not in v and abs(v["subject"]) <= 1 and abs(v["preview"]) <= 1 and v["twisty"] >= 2
                                     and v["icons"] is not None and v["icons"] >= 2 for v in dens)
              and "fehlt" not in grp and abs(grp.get("subject", 9)) <= 0.5 and abs(grp.get("preview", 9)) <= 0.5)
        return ok, f"{res}"
    check("Mailliste: Betreff der Karte bündig mit Absender und Vorschau (auch gruppiert), Abstand zu Thread-Knopf und Symbolen", card_alignment, results)

    def card_right_gap():
        # Rückmeldung 21.10.2026: Auswahl endete direkt hinter der Uhrzeit – rechts derselbe Abstand wie links
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); await wait(600);
          const r = await until(() => cards().find(c => !props(c).includes("dummy") && subjectOf(c).includes("Halo Ungelesen")), 6000);
          const star = cards().find(c => subjectOf(c).includes("Halo Schlagwort Work"));
          const box = r.querySelector(".card-container").getBoundingClientRect();
          const g = ad.createRange(); g.selectNodeContents(r.querySelector(".date")); const date = g.getBoundingClientRect();
          const out = { date: Math.round(box.right - date.right), avatarLeft: Math.round(r.querySelector(".mc-avatar")?.getBoundingClientRect().left - box.left) };
          if (star) { const sb = star.querySelector(".card-container").getBoundingClientRect(), ic = star.querySelector(".thread-card-icon-info").getBoundingClientRect();
                      out.icons = ic.width > 0 ? Math.round(sb.right - ic.right) : null; }
          return out;""")
        ok = res["date"] >= 8 and res["date"] <= 14 and (res.get("icons") is None or res["icons"] >= 8)
        return ok, f"Abstand rechter Rand ↔ Uhrzeit/Symbole {res}"
    check("Mailliste: Uhrzeit und Symbole der Karte mit Abstand zum rechten Rand der Auswahl (≥ 8 px wie links)", card_right_gap, results)

    def unread_tint():
        # Option „Ungelesene Mails hinterlegen“ (Standard aus): zarte Akzentfläche hinter ungelesenen Karten,
        # gelesene bleiben ohne, Auswahl bleibt Akzent bzw. Grau
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); await wait(600);
          const unread = () => cards().find(c => !props(c).includes("dummy") && props(c).includes("unread") && !c.classList.contains("selected"));
          const read = () => cards().find(c => !props(c).includes("dummy") && !props(c).includes("unread") && !c.classList.contains("selected"));
          const bg = r => r ? cs(r.querySelector(".card-container")).backgroundColor : null;
          let selHdr = null;
          const out = { off: { unread: bg(unread()), read: bg(read()) } };
          Services.prefs.setBoolPref("extensions.mailcards.unreadTint", true); await wait(800);
          try {
            out.on = { unread: bg(unread()), read: bg(read()) };
            sel = cards().find(c => !props(c).includes("dummy") && props(c).includes("unread"));
            const idx = a3.threadTree.view.rowCount > 0 ? [...Array(a3.threadTree.view.rowCount).keys()].find(i => a3.threadTree.getRowAtIndex(i) == sel) ?? -1 : -1;
            selHdr = idx >= 0 ? a3.gDBView.getMsgHdrAt(idx) : null;
            a3.threadTree.selectedIndex = idx;
            await wait(400);
            out.selected = sel ? bg(sel) : null; out.selUnread = sel ? props(sel).includes("unread") : null;
          } finally {
            Services.prefs.clearUserPref("extensions.mailcards.unreadTint"); a3.threadTree.selectedIndex = -1; await wait(500);
            // die ausgewählte Mail wurde dabei gelesen – für die folgenden Prüfungen wieder ungelesen
            if (selHdr) { selHdr.folder.markMessagesRead([selHdr], false); await wait(500); }
          }
          out.after = bg(unread());
          return out;""")
        on, off = res["on"], res["off"]
        ok = (off["unread"] and rgba_alpha(off["unread"]) == 0 and on["unread"] and 0.05 <= rgba_alpha(on["unread"]) <= 0.15
              and rgba_alpha(on["read"] or "rgba(0,0,0,0)") == 0 and res["after"] and rgba_alpha(res["after"]) == 0
              and res["selected"] and not same_color(res["selected"], on["unread"]))
        return ok, f"{res}"
    check("Mailliste: Option „Ungelesene hinterlegen“ tönt ungelesene Karten zart in Akzentfarbe (Standard aus)", unread_tint, results)

    def preview_while_scrolling():
        # Suchergebnisse aus vielen Ordnern (IMAP ohne gespeicherte Vorschau): kein Nachladen während die Liste scrollt –
        # erst danach; Scrollen bleibt im normalen Bildtakt
        res = m.js(MAILLIST_JS + r"""
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("mail-cards@sebastian.local").experimentAPIManager.global;
          const enh = Cu.evalInSandbox("enhancer", g);
          await showFolder(); await asCards(); await wait(600);
          const tree = a3.threadTree, before = enh.stats.deferred || 0;
          // Vorschau einer Zeile neu anfordern und gleichzeitig scrollen
          const row = cards().find(c => !props(c).includes("dummy"));
          const hdr = enh.hdrForRow(row); enh.requested.delete(`${hdr.folder.URI}#${hdr.messageKey}`);
          // (die Erweiterung sieht den Ordner in ihrem eigenen Compartment – gemessen an ihrer Warteschlange)
          enh.requestPreview(a3, hdr);
          const t0 = performance.now(); let during = 0;
          while (performance.now() - t0 < 600) { tree.dispatchEvent(new a3.Event("scroll")); await wait(50); during = Math.max(during, enh.pendingPreview.size); }
          await wait(800);
          return { deferred: (enh.stats.deferred || 0) - before, during, after: enh.pendingPreview.size };""")
        ok = res["deferred"] >= 1 and res["during"] >= 1 and res["after"] == 0
        return ok, f"{res}"
    check("Mailliste: Vorschau wird während des Scrollens nicht nachgeladen, erst danach (kein Ruckeln in Suchergebnissen)", preview_while_scrolling, results)

    def increased_contrast():
        # macOS „Kontrast erhöhen“ (prefers-contrast: more, simuliert über ui.useAccessibilityTheme): kräftigere Linien und
        # Sekundärtexte, ausgewählte Ordnerzeile mit Rand statt nur Fläche; ohne bleibt alles wie bisher
        res = m.js(r"""
          const a3 = await toMail(); await wait(500); const ad = a3.document;
          const v = (doc, name) => { const e = doc.createElement("div"); e.style.color = `var(${name})`; doc.documentElement.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
          const sel = () => { const c = ad.querySelector("#folderTree li.selected > .container"); return c ? a3.getComputedStyle(c).boxShadow : null; };
          const read = () => ({ sep: v(d, "--mt-separator"), secondary: v(d, "--mt-text-secondary"), selected: sel(), media: w.matchMedia("(prefers-contrast: more)").matches });
          const out = { normal: read() };
          Services.prefs.setIntPref("ui.useAccessibilityTheme", 1); await wait(900);
          try { out.more = read(); } finally { Services.prefs.clearUserPref("ui.useAccessibilityTheme"); await wait(600); }
          out.back = read();
          return out;""")
        n, mo, b = res["normal"], res["more"], res["back"]
        ok = (mo["media"] and not n["media"] and rgba_alpha(mo["sep"]) >= 0.25 and rgba_alpha(n["sep"]) <= 0.1
              and not same_color(mo["secondary"], n["secondary"]) and "inset" in (mo["selected"] or "")
              and same_color(b["sep"], n["sep"]) and b["selected"] == n["selected"])
        return ok, f"{res}"
    check("Bedienungshilfen: bei „Kontrast erhöhen“ kräftigere Linien und Texte, Auswahl mit Rand; sonst unverändert", increased_contrast, results)

    def view_choice_menu():
        # Ansicht und Layout als eine Auswahl: Kartenansicht (immer vertikal), Tabelle klassisch – im Drei-Punkte-Menü
        # und unter Ansicht → Layout; „breit“ nirgends wählbar und wird umgestellt (Tabelle → klassisch, Karten bleiben);
        # ungültige Kombinationen werden ausgeglichen; „Message List Header“ weg
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); await wait(500);
          const P = n => Services.prefs.getIntPref(n, -1), state = () => [P("mail.threadpane.listview"), P("mail.pane_config.dynamic")];
          const popup = ad.getElementById("threadPaneDisplayContext");
          popup.openPopup(ad.getElementById("threadPaneDisplayButton") || ad.getElementById("threadTree"), "after_end");
          await until(() => popup.state == "open", 3000); await wait(300);
          const vis = el => el && !el.hidden && el.getBoundingClientRect().height > 0;
          const out = { items: [...popup.children].filter(e => e.localName == "menuitem" && vis(e) && e.closest("menupopup") == popup).map(e => e.getAttribute("label") || e.textContent),
                        checked: [...popup.querySelectorAll("[name=mcviewchoice]")].filter(e => e.hasAttribute("checked") && e.getAttribute("checked") != "false").map(e => e.id) };
          popup.hidePopup(); await wait(300);
          const pick = async id => { ad.getElementById(id).doCommand(); await wait(700); return state(); };
          try {
            out.classic = await pick("mcViewChoiceClassic"); out.wideItem = !!ad.getElementById("mcViewChoiceWide");
            // „breit“ wie aus einer alten Einstellung oder Thunderbirds Befehl
            Services.prefs.setIntPref("mail.pane_config.dynamic", 1); await wait(400); out.wideFromTable = state();
            out.cards = await pick("mcViewChoiceCards");
            Services.prefs.setIntPref("mail.pane_config.dynamic", 1); await wait(400); out.wideFromCards = state();
            // Tabelle + vertikal (z. B. per Menüleiste „Vertical“ aus der Tabelle): wird Karten
            Services.prefs.setIntPref("mail.threadpane.listview", 1); await wait(400); out.tableAfter = state();
            Services.prefs.setIntPref("mail.pane_config.dynamic", 2); await wait(400); out.vertical = state();
            // Karten + klassisch (Menüleiste „Classic“): wird Tabelle
            Services.prefs.setIntPref("mail.pane_config.dynamic", 0); await wait(400); out.classicFromCards = state();
          } finally { ad.getElementById("mcViewChoiceCards").doCommand(); await wait(700); }
          const menu = id => d.getElementById(id);
          out.menubar = [...(menu("view_layout_popup")?.children || [])].filter(e => e.localName == "menuitem" && !e.hidden).map(e => e.getAttribute("label") || e.id);
          out.appWide = menu("appmenu_messagePaneWide") ? menu("appmenu_messagePaneWide").hidden : true;
          out.header = [menu("menu_toggleThreadPaneHeader")?.hidden, menu("appmenu_toggleThreadPaneHeader")?.hidden];
          return out;""")
        no_wide = lambda items: not any("Wide" in i or "messagePaneWide" in i for i in items)
        ok = (res["items"][:2] == ["Card View", "Table View: Classic"] and no_wide(res["items"]) and not res["wideItem"]
              and not any(i in ("Table View", "Cards View", "Hide Message List Header") for i in res["items"])
              and res["checked"] == ["mcViewChoiceCards"]
              and res["classic"] == [1, 0] and res["wideFromTable"] == [1, 0] and res["cards"] == [0, 2] and res["wideFromCards"] == [0, 2]
              and res["tableAfter"] == [1, 0] and res["vertical"] == [0, 2] and res["classicFromCards"] == [1, 0]
              and res["menubar"][:2] == ["Card View", "Table View: Classic"] and no_wide(res["menubar"]) and res["appWide"]
              and res["header"] == [True, True])
        return ok, f"{res}"
    check("Mailliste: Ansicht und Layout als eine Auswahl (Karten, Tabelle klassisch), „breit“ nicht wählbar und umgestellt, ungültige Kombinationen ausgeglichen, ohne Listenkopf-Schalter", view_choice_menu, results)

    def contact_photo_menu():
        # Drei-Punkte-Menü: „Show Contact Photo“ zum Abhaken; aus: kein Bild, Text rückt an die Punkt-Spalte (16 px);
        # wirkt sofort und bleibt als Einstellung; in der Tabelle ausgegraut
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); await wait(500);
          const PREF = "extensions.mailcards.contactPhotos";
          const popup = ad.getElementById("threadPaneDisplayContext"), item = ad.getElementById("mcContactPhoto");
          const open = async () => { popup.openPopup(ad.getElementById("threadTree"), "after_end"); await until(() => popup.state == "open", 3000); await wait(300);
                                     const r = { checked: item?.hasAttribute("checked") && item.getAttribute("checked") != "false", disabled: !!item?.disabled };
                                     popup.hidePopup(); await wait(300); return r; };
          const look = () => { const r = cards().find(x => !props(x).includes("dummy")); if (!r) return null;
            const av = r.querySelector(".mc-avatar"), box = r.querySelector(".card-container"), main = r.querySelector(".card-container > .thread-card-column:not(.read-status-column)");
            // senkrechte Mitte des Punkts (10 px) gegenüber der Absenderzeile
            const sr = r.querySelector(".sender")?.getBoundingClientRect(), bt = box.getBoundingClientRect().top;
            const dot = bt + parseFloat(cs(r.querySelector(".read-status")).top) + 5;
            return { avatar: av ? cs(av).display : null, indent: Math.round(main.getBoundingClientRect().left - box.getBoundingClientRect().left),
                     dotInSender: !!sr && dot >= sr.top && dot <= sr.bottom, dot: Math.round(dot - bt), sender: sr && [Math.round(sr.top - bt), Math.round(sr.bottom - bt)] }; };
          const out = { label: item?.getAttribute("label"), sepBefore: item?.previousElementSibling?.localName,
                        afterViews: item?.previousElementSibling?.previousElementSibling?.id };
          try {
            out.on = { ...(await open()), ...look() };
            item.doCommand(); await wait(600);
            out.off = { ...(await open()), ...look(), pref: Services.prefs.getBoolPref(PREF, true) };
            await asTable(); out.table = await open(); await asCards();
            item.doCommand(); await wait(600);
            out.back = { ...look(), pref: Services.prefs.prefHasUserValue(PREF) };
          } finally { Services.prefs.clearUserPref(PREF); await wait(300); }
          return out;""")
        on, off, back = res.get("on", {}), res.get("off", {}), res.get("back", {})
        ok = (res["label"] == "Show Contact Photo" and res["sepBefore"] == "menuseparator" and res["afterViews"] == "mcViewChoiceClassic"
              and on.get("checked") and not on.get("disabled") and on.get("avatar") == "flex" and on.get("indent", 0) - off.get("indent", 0) >= 40
              and not off.get("checked") and off.get("avatar") == "none" and off.get("indent", 99) <= 30 and off.get("pref") is False and off.get("dotInSender")
              and res["table"]["disabled"] and back.get("avatar") == "flex" and back.get("pref") is False)
        return ok, f"{res}"
    check("Mailliste: Kontaktfoto im Drei-Punkte-Menü ein-/ausschaltbar (sofort, als Einstellung gespeichert, in der Tabelle ausgegraut, ohne Foto Punkt neben dem Absender)", contact_photo_menu, results)

    def thread_sender():
        # zugeklappt: Name und Bild der neuesten Mail (Carla), aufgeklappt die Wurzel (Ben)
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); a3.gViewWrapper.showThreaded = true; await wait(800);
          const info = r => r && { sender: r.querySelector(".sender").textContent, avatar: r.querySelector(".mc-avatar").textContent,
                                   email: r.querySelector(".mc-avatar").dataset.email, img: !!r.querySelector(".mc-avatar img") };
          cmd("cmd_collapseAllThreads"); await wait(800);
          const closed = await until(() => cards().find(r => r.classList.contains("children") && r.classList.contains("collapsed") && subjectOf(r).includes("Halo Faden")
                                                           && r.querySelector(".mc-avatar")?.dataset.email), 6000);
          const out = { closed: info(closed) };
          cmd("cmd_expandAllThreads"); await wait(800);
          const open = await until(() => cards().find(r => r.classList.contains("children") && !r.classList.contains("collapsed") && subjectOf(r).includes("Halo Faden")), 6000);
          out.open = info(open);
          cmd("cmd_collapseAllThreads"); await wait(500);
          return out;""")
        c, o = res.get("closed") or {}, res.get("open") or {}
        ok = (c.get("sender") == "Carla Ölmann" and c.get("email") == "carla@example.invalid" and (c.get("img") or c.get("avatar") == "CÖ")
              and o.get("sender") == "Ben Muster" and o.get("email") == "ben@example.invalid" and (o.get("img") or o.get("avatar") == "BM"))
        return ok, f"{res}"
    check("Mailliste: zugeklappte Konversation zeigt Name und Bild der neuesten Mail", thread_sender, results)

    def thread_button():
        # Thread-Knopf ohne Stern und Akzentrahmen, Abstand zum Betreff; Ungelesen-Punkt
        # bei zugeklappter Konversation mit ungelesener Antwort
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); a3.gViewWrapper.showThreaded = true; await wait(600); cmd("cmd_collapseAllThreads"); await wait(800);
          const row = () => cards().find(r => r.classList.contains("children") && r.classList.contains("collapsed") && subjectOf(r).includes("Halo Faden"));
          const out = { gaps: {} };
          for (const density of [1, 0]) {
            Services.prefs.setIntPref("mail.uidensity", density); await wait(1200);
            const r = await until(row, 5000); const t = r.querySelector("button.twisty");
            out.gaps[density] = Math.round(r.querySelector(".subject").getBoundingClientRect().left - t.getBoundingClientRect().right);
          }
          Services.prefs.clearUserPref("mail.uidensity"); await wait(1000);
          const r = row(), t = r.querySelector("button.twisty"), dot = r.querySelector(".read-status");
          Object.assign(out, { props: r.dataset.properties, before: cs(t, "::before").content, border: cs(t).borderTopColor,
                               dot: cs(dot).display, dotColor: cs(dot).backgroundColor, accent });
          // ausgewählt mit Fokus: durchscheinende Kapsel auf der Akzentfarbe
          const i = [...Array(a3.gDBView.rowCount).keys()].find(k => a3.gDBView.getMsgHdrAt(k)?.messageId == "halo-ml-1@example.invalid");
          a3.threadTree.selectedIndex = i; a3.threadTree.focus(); await wait(800);
          const sel = await until(() => cards().find(x => x.classList.contains("selected") && subjectOf(x).includes("Halo Faden")), 4000);
          out.selected = sel ? cs(sel.querySelector("button.twisty")).backgroundColor : null;
          a3.threadTree.selectedIndex = -1; await wait(300);
          return out;""")
        ok = (res["before"] == "none" and rgba_alpha(res["border"]) == 0 and res["dot"] != "none" and same_color(res["dotColor"], res["accent"])
              and all(g >= 2 for g in res["gaps"].values()) and res["selected"] and rgba_alpha(res["selected"]) < 1)
        return ok, f"{res}"
    check("Mailliste: Thread-Knopf ohne Stern und Akzentrahmen, Ungelesen-Punkt an zugeklappter Konversation", thread_button, results)

    def date_weight():
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards();
          const r = await until(() => cards().find(x => props(x).includes("unread") && !props(x).includes("dummy")), 5000);
          return r ? { date: cs(r.querySelector(".date")).fontWeight, sender: cs(r.querySelector(".sender")).fontWeight } : {};""")
        return res.get("date") == "400" and res.get("sender") == "600", f"ungelesene Karte {res}"
    check("Mailliste: Datum ungelesener Karten normal, Absender halbfett", date_weight, results)

    def sent_avatar():
        # Gesendet: Name und Bild des Empfängers; im Mailkopf bleibt der Absender
        res = m.js(MAILLIST_JS + r"""
          await showFolder(sent); await asCards();
          const r = await until(() => cards().find(x => x.querySelector(".mc-avatar")?.dataset.email), 6000);
          if (!r) return {};
          const av = r.querySelector(".mc-avatar");
          const out = { sender: r.querySelector(".sender").textContent, avatar: av.textContent, email: av.dataset.email, img: !!av.querySelector("img") };
          a3.threadTree.selectedIndex = 0; await wait(1500);
          const md = a3.messageBrowser.contentWindow.document;
          const hav = await until(() => md.querySelector("#fromRecipient0 .mc-hdr-avatar")?.dataset.email && md.querySelector("#fromRecipient0 .mc-hdr-avatar"), 6000);
          out.header = hav ? { email: hav.dataset.email, text: hav.textContent } : null;
          a3.threadTree.selectedIndex = -1; await wait(300);
          return out;""")
        h = res.get("header") or {}
        ok = (res.get("sender") == "Anna Beispiel" and res.get("email") == "anna@example.invalid" and (res.get("img") or res.get("avatar") == "AB")
              and h.get("email") == "halo@example.invalid")
        return ok, f"{res}"
    check("Mailliste: Gesendet zeigt Bild des Empfängers, Mailkopf weiter den Absender", sent_avatar, results)

    def table_font():
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards();
          const card = await until(() => cards().find(x => !props(x).includes("dummy")), 5000);
          const out = { card: cs(card.querySelector(".sender")).fontSize };
          await asTable();
          const row = await until(() => tableRows()[0], 5000);
          out.row = cs(row.querySelector("td")).fontSize; out.head = cs(ad.querySelector("#threadTree thead th")).fontSize;
          await asCards(); return out;""")
        return res["card"] == res["row"] == res["head"] == "13px", f"Karte/Tabelle/Spaltenkopf {res}"
    check("Mailliste: Tabelle in 13 px wie Karten und Spaltenkopf", table_font, results)

    def table_unread():
        # Ungelesen als Punkt in Akzentfarbe (kein Grün), kein Stern vor neuen Mails;
        # Zusammenfassung mehrerer Mails ebenso
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asTable(); a3.threadTree.selectedIndex = -1; await wait(500);
          if (!tableRows().some(r => props(r).includes("new"))) {
            // neue Mail, solange der Ordner angezeigt wird (sonst setzt Thunderbird „neu“ zurück)
            list.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(raw({ id: "halo-ml-new-" + Date.now(), from: "Ida Viel <ida@example.invalid>", subject: "Halo Neu", date: ago(0, 7) }));
            await wait(1200);
          }
          const unread = await until(() => tableRows().find(r => props(r).includes("unread") && !r.classList.contains("selected")), 5000);
          const fresh = tableRows().find(r => props(r).includes("new") && !["replied", "forwarded", "redirected"].some(p => props(r).includes(p)));
          const img = unread?.querySelector(".tree-button-unread > img");
          const out = { fill: img && cs(img).fill, accent, newStar: fresh ? cs(fresh.querySelector(".subject-line img")).visibility : "keine neue Mail" };
          await asCards();
          // Zusammenfassung: eine ungelesene und eine gelesene Mail auswählen
          const v = a3.gDBView, ids = ["halo-ml-5@example.invalid", "halo-ml-6@example.invalid"];
          a3.threadTree.selectedIndices = [...Array(v.rowCount).keys()].filter(k => ids.includes(v.getMsgHdrAt(k)?.messageId)); await wait(1500);
          const md = a3.multiMessageBrowser?.contentDocument;
          const li = await until(() => md?.querySelector("#messageList > li.unread"), 5000);
          out.summary = li ? md.defaultView.getComputedStyle(li, "::before").fill : null;
          a3.threadTree.selectedIndex = -1; await wait(300);
          return out;""")
        ok = same_color(res["fill"], res["accent"]) and res["newStar"] == "hidden" and same_color(res["summary"], res["accent"])
        return ok, f"{res}"
    check("Mailliste: Tabelle und Zusammenfassung mit Ungelesen-Punkt in Akzentfarbe, ohne Stern", table_unread, results)

    def tag_contrast():
        # Schlagwortfarben als Schrift in der Tabelle mit Kontrast ≥ 4,5:1
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asTable(); a3.threadTree.selectedIndex = -1; await wait(600);
          const treeBg = rgba(cs(ad.getElementById("threadTree")).backgroundColor);
          const out = { rows: {} };
          for (const r of tableRows().filter(x => subjectOf(x).includes("Halo Schlagwort")))
            out.rows[subjectOf(r)] = contrast(over(rgba(cs(r).color), treeBg), over(rgba(cs(r).backgroundColor), treeBg));
          await asCards();
          return out;""")
        values = list(res["rows"].values())
        ok = len(res["rows"]) == 2 and all(v >= 4.5 for v in values)
        return ok, f"Kontrast {res}"
    check("Mailliste: Schlagwortfarben in der Tabelle lesbar (Kontrast ≥ 4,5:1)", tag_contrast, results)

    def unread_filter():
        # Filterknopf über der Liste wie Apple Mail: nur ungelesene Mails, erneut alle; bleibt beim Ordnerwechsel;
        # Thunderbirds Schnellfilter-Leiste erscheint nie (Knopf, Befehle, ⇧⌘K) und hat keine Menüeinträge mehr
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards(); a3.threadTree.selectedIndex = -1;
          // mindestens eine ungelesene (frühere Prüfungen können Mails gelesen haben)
          const emil = list.msgDatabase.getMsgHdrForMessageID("halo-ml-5@example.invalid");
          if (emil?.isRead) list.markMessagesRead([emil], false);
          cmd("cmd_expandAllThreads"); await wait(600);
          const btn = d.querySelector("#mcListHeader .mc-lh-filter"), bar = ad.getElementById("quick-filter-bar");
          const shown = () => [...Array(a3.gDBView.rowCount).keys()].map(i => a3.gDBView.getMsgHdrAt(i)).filter(Boolean);
          const barVisible = () => !!bar && (!bar.hidden || cs(bar).display != "none");
          // Thunderbirds Symbolleisten-Knopf „Schnellfilter“ (falls in der Symbolleiste) zeigt denselben Zustand
          const tbBtn = () => d.querySelector('#unifiedToolbarContent button[is="quick-filter-bar-toggle"]');
          const state = () => { const h = shown(); return { rows: h.length, unread: h.filter(x => !x.isRead).length, pressed: btn.getAttribute("aria-pressed"), bar: barVisible(),
                                                           tb: tbBtn()?.getAttribute("aria-pressed") ?? null }; };
          const out = { unreadInFolder: list.getNumUnread(false), before: state() };
          try {
            btn.click(); await wait(1200); out.on = state();
            const sentF = root.getChildNamed("Gesendet-Test");
            await showFolder(sentF); out.otherFolder = state();
            await showFolder(); cmd("cmd_expandAllThreads"); await wait(600); out.back = state();
            btn.click(); await wait(1200); out.off = state();
            cmd("cmd_toggleQuickFilterBar"); await wait(1200); out.cmdOn = state();
            cmd("cmd_toggleQuickFilterBar"); await wait(1200); out.cmdOff = state();
            cmd("cmd_showQuickFilterBar"); await wait(800); out.show = state();
          } finally {
            if (btn.getAttribute("aria-pressed") == "true") { btn.click(); await wait(1000); }
            a3.threadTree.table.body.focus();
          }
          out.menus = ["view_toolbars_popup_quickFilterBar", "appmenu_quickFilterBar"].map(id => d.getElementById(id)?.hidden ?? true);
          return out;""")
        b, on, oth, back, off = res["before"], res["on"], res["otherFolder"], res["back"], res["off"]
        n = res["unreadInFolder"]
        ok = (n >= 1 and b["rows"] > n and b["pressed"] == "false"
              and on["pressed"] == "true" and on["rows"] == on["unread"] == n
              and oth["pressed"] == "true" and oth["rows"] == 0
              and back["pressed"] == "true" and back["rows"] == n
              and off["pressed"] == "false" and off["rows"] == b["rows"]
              and res["cmdOn"]["pressed"] == "true" and res["cmdOn"]["rows"] == n and res["cmdOff"]["rows"] == b["rows"]
              and not any(res[k]["bar"] for k in ("before", "on", "off", "cmdOn", "cmdOff", "show"))
              and res["menus"] == [True, True]
              and all(res[k]["tb"] in (None, res[k]["pressed"]) for k in ("before", "on", "otherFolder", "back", "off", "cmdOn", "cmdOff")))
        return ok, f"{res}"
    check("Mailliste: Filterknopf zeigt nur ungelesene Mails und wieder alle, bleibt beim Ordnerwechsel; Schnellfilter-Leiste erscheint nie", unread_filter, results)

    def layout_lines():
        res = m.js(MAILLIST_JS + r"""
          await showFolder(); await asCards();
          const before = Services.prefs.getIntPref("mail.pane_config.dynamic", 2);
          const line = () => { const p = ad.getElementById("messagePane"); return { width: parseFloat(cs(p).borderTopWidth), style: cs(p).borderTopStyle,
            left: Math.round(p.getBoundingClientRect().left), folders: Math.round(ad.getElementById("folderPane").getBoundingClientRect().left) }; };
          const out = {};
          cmd("cmd_viewClassicMailLayout"); await wait(1200); out.classic = line();
          // Thunderbirds Befehl für „breit“ landet in „klassisch“
          cmd("cmd_viewWideMailLayout"); await wait(1200); out.wide = line(); out.widePane = Services.prefs.getIntPref("mail.pane_config.dynamic", -1);
          cmd("cmd_viewVerticalMailLayout"); await wait(1200); out.vertical = line();
          Services.prefs.setIntPref("mail.pane_config.dynamic", before); await wait(800);
          return out;""")
        c, v = res["classic"], res["vertical"]
        ok = (c["width"] > 0 and c["style"] == "solid" and res["widePane"] != 1 and v["width"] == 0)
        return ok, f"{res}"
    check("Mailliste: Layout „klassisch“ mit Linie über der Leseansicht, „vertikal“ ohne, „breit“ nicht mehr erreichbar", layout_lines, results)

    def account_central():
        res = m.js(MAILLIST_JS + r"""
          a3.displayFolder(root.URI);
          const doc = await until(() => { const x = ad.getElementById("accountCentralBrowser")?.contentDocument; return x?.getElementById("accountCentral") && x; }, 8000);
          if (!doc) return {};
          const vis = e => e.getClientRects().length && e.getBoundingClientRect().height > 0;
          const parts = () => [doc.body, ...[...doc.querySelectorAll(".account-central-header, .account-central-section")].filter(vis)];
          const bgs = () => [...new Set(parts().map(e => doc.defaultView.getComputedStyle(e).backgroundColor))];
          await until(() => bgs().length == 1, 4000);
          const btn = [...doc.querySelectorAll(".btn-hub")].find(vis);
          const out = { backgrounds: bgs(), radius: btn ? doc.defaultView.getComputedStyle(btn).borderTopLeftRadius : null };
          await showFolder(); return out;""")
        ok = len(res.get("backgrounds", [])) == 1 and res.get("radius") == "6px"
        return ok, f"{res}"
    check("Mailliste: Konto-Startseite in einer ruhigen Fläche, Kacheln als Knöpfe", account_central, results)

    def account_hub_fields():
        # Account Hub: die Dialogfeld-Regel (28 px, Haarlinie, 7 px) gilt hier
        # nicht – Felder behalten ihre Höhe, die Beschriftung sitzt in der
        # Rahmenkerbe statt frei darüber (Gegenprobe 28 px: „Dialoge: Eingabefelder …“)
        res = m.js(r"""
          await toMail();
          const hub = () => [...d.querySelectorAll("account-hub-container")].map(c => c.shadowRoot?.querySelector("dialog")).find(x => x?.open);
          w.openAccountHub();
          const dl = await until(hub, 8000);
          if (!dl) return { open: false };
          const root = dl.getRootNode();
          const field = id => until(() => { const i = root.getElementById(id); return i?.getClientRects().length && i; }, 6000);
          const out = { open: true, cls: dl.className };
          for (const id of ["realName", "email"]) {
            const i = await field(id); if (!i) { out[id] = null; continue; }
            const lab = root.querySelector(`label[for="${id}"]`);
            out[id] = { h: Math.round(i.getBoundingClientRect().height), top: i.getBoundingClientRect().top,
                        labBottom: lab ? lab.getBoundingClientRect().bottom : null, pad: w.getComputedStyle(i).paddingTop };
          }
          dl.close(); await wait(500);
          out.closed = !hub();
          return out;""")
        rn, em = res.get("realName"), res.get("email")
        ok = (res.get("open") and res.get("closed") and rn and em
              and rn["h"] >= 36 and em["h"] >= 36 and rn["labBottom"] is not None
              and rn["labBottom"] >= rn["top"] - 2)
        return ok, f"{res}"
    check("Account Hub: Felder in eigener Höhe (≥ 36 px), Beschriftung „Full name“ in der Rahmenkerbe statt darüber", account_hub_fields, results)

    # aufräumen: Testmails endgültig löschen (sonst fänden spätere Prüfungen wie
    # die Suche sie mit), Gesendet-Merkmal wieder entfernen
    m.js(MAILLIST_JS + r"""
      a3.threadTree.selectedIndex = -1; await asCards();
      for (const f of [list, sent]) { const hs = [...f.messages]; if (hs.length) f.deleteMessages(hs, null, true, false, null, false); }
      sent.clearFlag(Ci.nsMsgFolderFlags.SentMail); await wait(800); return 1;""")


# Leseansicht und Mailkopf: erfundene Mails (example.invalid) im Ordner „Kopf“
READING_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const root = MailServices.accounts.localFoldersServer.rootFolder;
  const pad = n => String(n).padStart(2, "0");
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const rfc = dt => { const o = -dt.getTimezoneOffset();
    return `${DAYS[dt.getDay()]}, ${pad(dt.getDate())} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())} ${o >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(o) / 60))}${pad(Math.abs(o) % 60)}`; };
  const ics = (days, h) => { const t = new Date(); t.setDate(t.getDate() + days); t.setHours(h, 0, 0, 0); return t.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
  const raw = o => unescape(encodeURIComponent([`From: ${o.from || "Anna Beispiel <anna@example.invalid>"}`, `To: ${o.to || "Halo Test <halo@example.invalid>"}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []), `Subject: ${o.subject}`, `Date: ${rfc(o.date || new Date(Date.now() - 2 * 86400000))}`, `Message-ID: <${o.id}@example.invalid>`,
    "MIME-Version: 1.0", `Content-Type: ${o.type || "text/plain; charset=UTF-8"}`, "", o.body || "Erfundene Testnachricht.", ""].join("\r\n")));
  if (!root.containsChildNamed("Kopf")) { root.createSubfolder("Kopf", null); await wait(800); }
  const f = root.getChildNamed("Kopf");
  if (!f.getTotalMessages(false)) {
    const many = ["Halo Test", "Anna Beispiel", "Ben Muster", "Carla Ölmann", "Emil Kurz", "Frieda Lang", "Gustav Weit", "Jana Breit", "Karl Lang", "Lena Mehr", "Mia Viel", "Nora Weit"]
      .map(n => `${n} <${n.split(" ")[0].toLowerCase()}@example.invalid>`).join(", ");
    const b = "----=_halo_kopf", c = "----=_halo_einladung";
    const vcal = ["BEGIN:VCALENDAR", "PRODID:-//Halo//Test//DE", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT", "UID:halo-kopf-einladung@example.invalid",
      `DTSTAMP:${ics(0, 8)}`, `DTSTART:${ics(3, 10)}`, `DTEND:${ics(3, 11)}`, "SUMMARY:Halo Workshop", "LOCATION:Raum 2.01",
      "ORGANIZER;CN=Anna Beispiel:mailto:anna@example.invalid",
      "ATTENDEE;CN=Halo Test;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:halo@example.invalid",
      "ATTENDEE;CN=Anna Beispiel;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:anna@example.invalid", "SEQUENCE:0", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const att = name => `--${b}\r\nContent-Type: text/plain; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa("Erfundene Testdatei " + name)}\r\n`;
    const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
    for (const o of [
      { id: "halo-kopf-lang", from: "Dr. Maximilian Alexander von Langenname-Überlänge <max@example.invalid>",
        subject: "Halo Lang: eine sehr lange Betreffzeile, die garantiert nicht in eine Zeile passt, weil sie wirklich außergewöhnlich viele Wörter enthält – und noch mehr", body: "Kurzer Inhalt." },
      { id: "halo-kopf-viele", from: "Dana Zöllner <dana@example.invalid>", to: many, cc: "Hannah Mehr <hannah@example.invalid>, Ida Viel <ida@example.invalid>", subject: "Halo Viele Empfänger" },
      { id: "halo-kopf-anhang", subject: "Halo Anhänge", type: `multipart/mixed; boundary="${b}"`,
        body: `--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nDrei Anhänge.\r\n${att("Ausflug-01.txt")}${att("Ausflug-02.txt")}${att("Notizen.txt")}--${b}--` },
      { id: "halo-kopf-einladung", subject: "Einladung: Halo Workshop", type: `multipart/alternative; boundary="${c}"`,
        body: `--${c}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nErfundene Einladung.\r\n--${c}\r\nContent-Type: text/calendar; charset=UTF-8; method=REQUEST\r\n\r\n${vcal}\r\n--${c}--` },
      { id: "halo-kopf-jetzt", subject: "Halo Jetzt", date: new Date() },
      { id: "halo-kopf-kontakt", from: "Paula Panel <paula@example.invalid>", subject: "Halo Kontakt" },
    ]) lf.addMessage(raw(o));
    await wait(1000);
  }
  const a3 = await toMail();
  const md = () => a3.messageBrowser.contentDocument;
  const cs = (el, p) => el.ownerDocument.defaultView.getComputedStyle(el, p);
  const vis = el => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
  const showMail = async subj => {
    if (a3.gFolder?.URI != f.URI) { a3.displayFolder(f.URI); await until(() => a3.gFolder?.URI == f.URI && a3.gDBView, 6000); await wait(800); }
    const v = a3.gDBView; let i = -1;
    for (let k = 0; k < v.rowCount; k++) if ((v.getMsgHdrAt(k).mime2DecodedSubject || "").includes(subj)) i = k;
    a3.threadTree.selectedIndex = i;
    await until(() => (md().getElementById("expandedsubjectBox")?.textContent || "").includes(subj) && md().getElementById("messagepane")?.contentDocument?.body?.textContent, 6000);
    await wait(900); return md(); };
  // schmaler Mailbereich (unter 768 px stellt Thunderbird den Kopf auf Spalten um): Today-Pane auf
  const tpCmd = d.getElementById("calendar_toggle_todaypane_command");
  const narrow = async () => { if (md().documentElement.clientWidth >= 768 && !w.TodayPane.isVisible) { tpCmd.doCommand(); w.__haloTpOpened = true; await wait(1500); } return md().documentElement.clientWidth; };
  const restore = async () => { if (w.__haloTpOpened && w.TodayPane.isVisible) { tpCmd.doCommand(); await wait(800); } w.__haloTpOpened = false; };
  const rgb = c => (c.match(/-?[\d.]+/g) || []).map(Number).map((v, i) => (c.startsWith("color(") && i < 3 ? v * 255 : v));
  const lum = ([r, g, b]) => { const t = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * t(r) + 0.7152 * t(g) + 0.0722 * t(b); };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  const over = (fg, bg) => { const al = fg[3] ?? 1; return fg.slice(0, 3).map((v, i) => v * al + bg[i] * (1 - al)); };"""


def reading_checks(m, results):
    """Leseansicht und Mailkopf: langer Absender, Einladung, Anhänge, Suchleiste, Kontakt-Panel, Mail im Tab, Datum, Linie, „Mehr“, Kommas."""

    def long_sender():
        # schmaler Mailbereich: Name endet mit „…“ vor Ordner und Uhrzeit, Kopf nicht breiter als der Mailbereich
        res = m.js(READING_JS + r"""
          let doc = await showMail("Halo Lang"); const width = await narrow(); doc = md(); await wait(500);
          const header = doc.getElementById("messageHeader"), meta = doc.getElementById("mcHdrMeta"), subj = doc.getElementById("expandedsubjectBox");
          const name = [...doc.querySelectorAll("#fromRecipient0 :is(.recipient-single-line, .recipient-multi-line-name)")].find(vis);
          // das kürzende Element: der Name selbst (Block) oder sein Listenelement (einzeiliger Name)
          const box = name && (cs(name).display == "inline" ? name.closest("li") : name);
          const out = { width, scroll: header.scrollWidth, client: header.clientWidth, name: name?.textContent,
                        nameRight: Math.round(box?.getBoundingClientRect().right), metaLeft: Math.round(meta?.getBoundingClientRect().left),
                        subjRight: Math.round(subj.getBoundingClientRect().right), headerRight: Math.round(header.getBoundingClientRect().right),
                        ellipsis: box && cs(box).textOverflow, cut: box && box.scrollWidth > box.clientWidth };
          await restore(); return out;""")
        ok = (res["width"] < 768 and res["scroll"] <= res["client"] + 1 and res["nameRight"] <= res["metaLeft"] + 1
              and res["subjRight"] <= res["headerRight"] and res["ellipsis"] == "ellipsis" and res["cut"])
        return ok, f"{res}"
    check("Mailkopf: langer Absender im schmalen Mailbereich endet mit „…“ vor Ordner und Uhrzeit, Betreff ganz", long_sender, results)

    def invitation():
        # Einladung: graue Kapsel statt blauer/lila Fläche mit Schatten, Text einzeilig und lesbar; Details in voller Breite
        res = m.js(READING_JS + r"""
          await showMail("Halo Workshop"); await narrow(); const doc = md();
          const bar = await until(() => vis(doc.getElementById("imip-bar")) && doc.getElementById("imip-bar"), 6000);
          if (!bar) { await restore(); return { bar: false }; }
          await wait(500);
          const s = cs(bar), t = bar.querySelector(".msgNotificationBarText");
          const lh = parseFloat(cs(t).lineHeight) || parseFloat(cs(t).fontSize) * 1.2;
          const win = rgb(cs(doc.getElementById("messageHeader")).backgroundColor);
          const btn = doc.getElementById("imipAcceptButton");
          const body = doc.getElementById("messagepane").contentDocument;
          const border = await until(() => body.querySelector(".invitation-border"), 6000);
          const out = { bar: true, bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow,
                        text: t.textContent.trim(), textLines: Math.round(t.getBoundingClientRect().height / lh * 10) / 10,
                        // Text über die ganze Zeile (nicht als schmale Spalte neben den Knöpfen), Knöpfe darunter
                        fullRow: t.getBoundingClientRect().right >= bar.getBoundingClientRect().right - parseFloat(s.paddingRight) - 2,
                        below: doc.getElementById("imip-view-toolbox").getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1,
                        contrast: contrast(rgb(cs(t).color), over(rgb(s.backgroundColor), win)),
                        btnRadius: parseFloat(cs(btn).borderTopLeftRadius), btnBorder: cs(btn.querySelector(".toolbarbutton-menubutton-button") || btn).borderTopColor,
                        bodyScroll: body.documentElement.scrollWidth, inner: body.defaultView.innerWidth,
                        cardBorder: border && parseFloat(cs(border).borderTopWidth), cardRight: border && Math.round(border.getBoundingClientRect().right) };
          await restore(); return out;""")
        ok = (res.get("bar") and res["bg"] not in ("rgb(192, 132, 252)", "rgb(221, 238, 254)") and res["radius"] >= 10
              and res["shadow"] == "none" and res["fullRow"] and res["below"] and res["contrast"] >= 4.5 and res["btnRadius"] >= 10
              and rgba_alpha(res["btnBorder"]) == 0 and res["bodyScroll"] <= res["inner"] + 1
              and res["cardBorder"] is not None and res["cardBorder"] <= 1 and res["cardRight"] <= res["inner"])
        return ok, f"{res}"
    check("Einladung: Leiste als graue Kapsel (Text über die ganze Zeile, lesbar, Knöpfe darunter), Details als Karte in der Breite des Lesebereichs", invitation, results)

    def attachments():
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Anhänge");
          doc.defaultView.toggleAttachmentList?.(true, true); await wait(900);
          const list = doc.getElementById("attachmentList");
          // Hauptfenster vorn, sonst bekommt die Liste unter Linux (xvfb) keinen Fokus und bleibt grau
          // läuft daneben ein zweites Testfenster (z. B. CI-Job auf demselben Mac), holt es sich den Fokus zurück – dann mehrmals versuchen
          let inactive = true;
          for (let i = 0; i < 4 && inactive; i++) {
            w.focus(); await until(() => Services.focus.activeWindow == w, 3000);
            list.selectedIndex = 0; list.focus(); await until(() => list.matches(":focus-within"), 2000); await wait(400);
            inactive = d.documentElement.matches(":-moz-window-inactive") || !list.matches(":focus-within");
          }
          const item = list.querySelector(".attachmentItem[selected]");
          const focused = { bg: cs(item).backgroundColor, radius: parseFloat(cs(item).borderTopLeftRadius), outline: cs(item).outlineStyle, inactive };
          a3.threadTree.focus(); await wait(300);
          const out = { list: cs(list).backgroundColor, header: cs(doc.getElementById("messageHeader")).backgroundColor,
                        bar: cs(doc.getElementById("attachmentBar")).backgroundColor, focused, unfocused: cs(item).backgroundColor,
                        accent: (() => { const e = doc.createElement("div"); e.style.color = "AccentColor"; doc.documentElement.append(e); const c = cs(e).color; e.remove(); return c; })() };
          doc.defaultView.toggleAttachmentList?.(false); return out;""")
        f = res["focused"]
        ok = (same_color(res["list"], res["header"]) and same_color(res["bar"], res["header"]) and f["radius"] >= 6
              and f["outline"] == "none" and not same_color(res["unfocused"], res["accent"]))
        if f["inactive"]:
            # Fenster trotz mehrerer Versuche nicht aktiv: die Akzentfarbe mit Fokus lässt sich nicht messen
            return ok, f"Testfenster nicht aktiv (anderes Fenster hat den Fokus) – Fokusfarbe übersprungen {res}"
        return ok and same_color(f["bg"], res["accent"]), f"{res}"
    check("Anhänge: Liste auf der Fläche der Mail, markierte Datei abgerundet ohne Rahmen (unfokussiert grau)", attachments, results)

    def find_bar():
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Jetzt"); await narrow();
          a3.commandController.doCommand("cmd_find"); await wait(900);
          const fb = doc.querySelector("findbar");
          if (!fb || fb.hidden) { await restore(); return { open: false }; }
          const right = fb.getBoundingClientRect().right;
          const outside = [...fb.querySelectorAll(".findbar-container > *")].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > right + 1)
            .map(e => e.getAttribute("anonid") || e.className);
          const tb = fb.querySelector(".findbar-textbox");
          const out = { open: true, width: Math.round(right), outside, border: cs(tb).borderTopStyle, radius: parseFloat(cs(tb).borderTopLeftRadius) };
          fb.close(); await wait(900);
          // geschlossen: keine Lücke unter der Mail
          // (bis zur Schnellantwort unter der Mail, sofern sie da ist)
          const qr = doc.getElementById("mcQuickReply");
          const floor = qr?.getClientRects().length ? qr.getBoundingClientRect().top : doc.getElementById("messagepanebox").getBoundingClientRect().bottom;
          out.gap = Math.round(floor - doc.getElementById("messagepane").getBoundingClientRect().bottom);
          await restore(); return out;""")
        ok = res.get("open") and not res["outside"] and res["border"] == "none" and res["radius"] >= 6 and res["gap"] <= 1
        return ok, f"{res}"
    check("Suchleiste in der Mail: nichts abgeschnitten, Suchfeld ohne Rahmen, geschlossen ohne Lücke", find_bar, results)

    def contact_panel():
        # Panel „Kontakt bearbeiten“ (über das Menü zur Absenderadresse) mit der Fläche der Tooltips
        res = m.js(READING_JS + r"""
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          let card = book.childCards.find(c => c.primaryEmail == "paula@example.invalid");
          if (!card) { card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            card.displayName = "Paula Panel"; card.primaryEmail = "paula@example.invalid"; card = book.addCard(card); }
          const doc = await showMail("Halo Kontakt");
          const menu = doc.getElementById("emailAddressPopup"), from = doc.querySelector("#fromRecipient0");
          (from.querySelector(".recipient-single-line, .recipient-multi-line-name") || from).click();
          await until(() => menu.state == "open", 3000);
          const item = doc.getElementById("editContactItem"); const shown = !!item && !item.hidden;
          if (shown) item.doCommand();
          menu.hidePopup();
          const panel = await until(() => { const p = doc.getElementById("editContactPanel"); return p?.state == "open" && p; }, 4000);
          const out = { shown, open: !!panel };
          if (panel) { await wait(300); const s = cs(panel), r = cs(doc.documentElement);
            Object.assign(out, { bg: s.getPropertyValue("--panel-background-color").trim(), want: r.getPropertyValue("--mt-tooltip-bg").trim(),
                                 border: s.getPropertyValue("--panel-border-color").trim(), wantBorder: r.getPropertyValue("--mt-tooltip-border").trim() });
            panel.hidePopup(); await wait(300); }
          book.deleteCards([card]); return out;""")
        ok = res.get("open") and res["bg"] == res["want"] and res["border"] == res["wantBorder"] and "262d3b" not in res["bg"].lower()
        return ok, f"{res}"
    check("Mailkopf: Panel „Kontakt bearbeiten“ mit neutraler Fläche wie die Tooltips", contact_panel, results)

    def message_tab():
        # Mail im eigenen Tab: kein Listenkopf, kein Grau der Ordnerliste; zurück im Mail-Tab wieder da
        res = m.js(READING_JS + r"""
          await showMail("Halo Jetzt"); await wait(500);
          const hdr = a3.gDBView.hdrForFirstSelectedMessage;
          tm.openTab("mailMessageTab", { messageURI: hdr.folder.getUriForMsg(hdr), background: false });
          await until(() => d.documentElement.getAttribute("mc-tab") == "mailMessageTab", 6000); await wait(1500);
          const row = d.getElementById("unifiedToolbarContainer"), status = d.getElementById("status-bar"), lh = d.getElementById("mcListHeader");
          const v = (el, n) => w.getComputedStyle(el).getPropertyValue(n).trim();
          const tab = { mode: d.documentElement.getAttribute("mc-tab"), header: lh && w.getComputedStyle(lh).display,
                        row: v(row, "--mc-sidebar-right"), status: v(status, "--mc-sidebar-right"), line: v(row, "--mc-list-right") };
          tm.closeTab(tm.currentTabInfo); await toMail(); await wait(1200);
          const mail = { mode: d.documentElement.getAttribute("mc-tab"), header: lh && w.getComputedStyle(lh).display, row: v(row, "--mc-sidebar-right") };
          return { tab, mail };""")
        t, ml = res["tab"], res["mail"]
        ok = (t["mode"] == "mailMessageTab" and t["header"] == "none" and t["row"] == "0px" and t["status"] == "0px" and t["line"] == "-10px"
              and ml["mode"] == "mail3PaneTab" and ml["header"] != "none" and float(ml["row"].replace("px", "") or 0) > 0)
        return ok, f"{res}"
    check("Mail im eigenen Tab: ohne Listenkopf und Seitenleisten-Grau, im Mail-Tab wieder vorhanden", message_tab, results)

    def list_date():
        # Uhrzeit in Liste und Kopf im selben Format (Regionaleinstellungen des Systems)
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Jetzt");
          const hdr = a3.gDBView.hdrForFirstSelectedMessage;
          const row = await until(() => [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"]')].find(r => (r.querySelector(".subject")?.textContent || "").includes("Halo Jetzt") && r.querySelector(".date")?.textContent), 6000);
          const norm = s => (s || "").replace(/\s+/g, " ").trim();
          // ältere Mail (vor zwei Tagen): ganzes Datum mit Uhrzeit im Muster des Systems
          const oldHdr = [...f.messages].find(h => h.messageId == "halo-kopf-anhang@example.invalid");
          const oldRow = [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"]')].find(r => (r.querySelector(".subject")?.textContent || "").includes("Halo Anhänge"));
          return { list: norm(row?.querySelector(".date")?.textContent), header: norm(doc.querySelector("#mcHdrMeta #dateLabel")?.textContent),
                   want: norm(new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(hdr.date / 1000))),
                   old: norm(oldRow?.querySelector(".date")?.textContent), oldWant: oldHdr && norm(new Services.intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(oldHdr.date / 1000))) };""")
        # Karten zeigen immer die Uhrzeit: heute „Today, 16:31“ (Uhrzeit wie im Kopf), älter Datum und Uhrzeit
        ok = (bool(res["list"]) and res["list"].endswith(res["want"]) and res["want"] in res["header"]
              and bool(res["old"]) and res["old"] == res["oldWant"])
        return ok, f"{res}"
    check("Mailliste und Mailkopf: Uhrzeit und Datum im Format der Regionaleinstellungen", list_date, results)

    def header_line():
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Jetzt");
          const top = doc.getElementById("mail-notification-top"), header = doc.getElementById("messageHeader");
          return { top: parseFloat(cs(top).borderBottomWidth), header: parseFloat(cs(header).borderBottomWidth),
                   gap: Math.round((doc.getElementById("messagepane").getBoundingClientRect().top - header.getBoundingClientRect().bottom) * 10) / 10 };""")
        ok = res["top"] == 0 and res["header"] > 0 and res["gap"] <= 0.5
        return ok, f"{res}"
    check("Mailkopf: eine Linie zum Mailtext (keine zweite darunter)", header_line, results)

    def addon_buttons():
        # Knopf einer anderen Erweiterung (messageDisplayAction, hier nachgestellt): Zeile bleibt mit
        # nur diesem Knopf, die eigenen Knöpfe entfallen; ohne ihn und in Konversationskarten keine Zeile
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Jetzt");
          const box = doc.getElementById("header-view-toolbox"), bar = doc.getElementById("header-view-toolbar");
          const shown = e => !!e && cs(e).display != "none";
          const out = { before: shown(box) };
          const fake = doc.createXULElement("toolbarbutton");
          fake.className = "toolbarbutton-1 webextension-action"; fake.id = "mc-test-action"; fake.setAttribute("label", "Test");
          bar.append(fake); await wait(100);
          out.withAddon = shown(box); out.addon = shown(fake);
          out.builtin = [...bar.children].filter(e => e != fake && shown(e)).map(e => e.id);
          fake.hidden = true; await wait(100); out.hiddenAddon = shown(box); fake.hidden = false;
          doc.documentElement.setAttribute("mc-conv-card", ""); await wait(100); out.card = shown(box);
          doc.documentElement.removeAttribute("mc-conv-card"); fake.remove();
          return out;""")
        ok = (not res["before"] and res["withAddon"] and res["addon"] and not res["builtin"]
              and not res["hiddenAddon"] and not res["card"])
        return ok, f"{res}"
    check("Mailkopf: Knöpfe anderer Erweiterungen (z. B. Übersetzen) bleiben sichtbar, eigene Knöpfe nicht; ohne sie und in Konversationskarten keine Knopfzeile", addon_buttons, results)

    def recipients():
        # viele Empfänger: „Mehr“ als graue Kapsel in 11 px; Kommas in Cc wie in An
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Viele Empfänger");
          const btn = [...doc.querySelectorAll("#expandedtoBox .show-more-recipients")].find(vis);
          const accent = (() => { const e = doc.createElement("div"); e.style.color = "AccentColor"; doc.documentElement.append(e); const c = cs(e).color; e.remove(); return c; })();
          const comma = id => { const li = doc.querySelector(`#${id} li.header-recipient`); return li && cs(li, "::after").color; };
          return { more: !!btn, transform: btn && cs(btn).textTransform, size: btn && parseFloat(cs(btn).fontSize), bg: btn && cs(btn).backgroundColor, accent,
                   to: comma("expandedtoBox"), cc: comma("expandedccBox") };""")
        ok = (res["more"] and res["transform"] == "none" and res["size"] >= 11 and not same_color(res["bg"], res["accent"])
              and res["to"] and res["cc"] and same_color(res["to"], res["cc"]))
        return ok, f"{res}"
    check("Mailkopf: „Mehr“-Knopf als graue Kapsel in 11 px, Kommas in Cc wie in An", recipients, results)

    def conversation():
        # Leseansicht wie Apple Mail: ganze Konversation – empfangene Mail im einen Ordner, eigene Antwort in „Gesendet“ –
        # als Karten untereinander, neueste oben, eigene abgesetzt; zugeklappter Faden ebenso statt Zusammenfassung; aus: nicht
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { GlodaMsgIndexer } = ChromeUtils.importESModule("resource:///modules/gloda/IndexMsg.sys.mjs");
          const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
          const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
          if (!acc.identities.length) { const id = MailServices.accounts.createIdentity(); id.fullName = "Halo Test"; id.email = "halo@example.invalid"; acc.addIdentity(id); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const folder = name => { if (!root.containsChildNamed(name)) root.createSubfolder(name, null); return root.getChildNamed(name); };
          const eingang = folder("KonvEingang"), gesendet = folder("KonvGesendet"); gesendet.setFlag(Ci.nsMsgFolderFlags.SentMail);
          await wait(800);
          const mail = (from, to, subject, id, refs, minutesAgo) => unescape(encodeURIComponent([`From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
            `Date: ${new Date(Date.now() - minutesAgo * 60000).toUTCString().replace("GMT", "+0000")}`, `Message-ID: <${id}@example.invalid>`,
            ...(refs ? [`In-Reply-To: <${refs}@example.invalid>`, `References: <${refs}@example.invalid>`] : []),
            "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", `Text von ${from.split(" ")[0]}.\n`.repeat(3), ""].join("\r\n")));
          if (!eingang.getTotalMessages(false)) {
            eingang.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Anna Beispiel <anna@example.invalid>", "Halo Test <halo@example.invalid>", "Halo Konversation", "halo-konv-1", null, 120));
            gesendet.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Halo Test <halo@example.invalid>", "Anna Beispiel <anna@example.invalid>", "Re: Halo Konversation", "halo-konv-2", "halo-konv-1", 60));
            // Faden im selben Ordner (zugeklappt auswählen)
            eingang.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Ben Muster <ben@example.invalid>", "Halo Test <halo@example.invalid>", "Halo Faden zu", "halo-konv-3", null, 50));
            eingang.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Ben Muster <ben@example.invalid>", "Halo Test <halo@example.invalid>", "Re: Halo Faden zu", "halo-konv-4", "halo-konv-3", 40));
            await wait(1000);
          }
          const hdrs = f => [...f.messages];
          GlodaMsgIndexer.indexMessages([...hdrs(eingang), ...hdrs(gesendet)].map(h => [h.folder, h.messageKey]));
          const first = hdrs(eingang).find(h => h.messageId == "halo-konv-1@example.invalid");
          for (let i = 0; i < 60; i++) { const ok = await new Promise(r => Gloda.getMessageCollectionForHeader(first, { onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {},
              onQueryCompleted: c => { const conv = c.items[0]?.conversation; if (!conv) return r(false);
                conv.getMessagesCollection({ onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {}, onQueryCompleted: m => r(m.items.filter(x => x.folderMessage).length >= 2) }); } }));
            if (ok) break; await wait(500); }
          const a3 = await toMail(); a3.displayFolder(eingang.URI); await wait(900);
          a3.gViewWrapper.showThreaded = true; await wait(500);
          const select = id => { const i = [...Array(a3.gDBView.rowCount).keys()].find(k => a3.gDBView.getMsgHdrAt(k)?.messageId == id); a3.threadTree.selectedIndex = i ?? -1; return i; };
          const read = async () => {
            const box = await until(() => a3.document.getElementById("mcConversation"), 6000);
            if (!box) return null;
            await until(() => [...box.querySelectorAll(".mc-conv-browser")].every(b => parseFloat(b.style.height) > 100) && box.querySelectorAll(".mc-conv-browser").length >= 2, 8000);
            await wait(400);
            const cards = [...box.querySelectorAll(".mc-conv-card")];
            return { count: box.querySelector(".mc-conv-count")?.textContent, ids: cards.map(c => c.dataset.messageId.split("@")[0]), own: cards.map(c => c.classList.contains("mc-own")),
                     heights: cards.map(c => Math.round(c.querySelector(".mc-conv-browser")?.getBoundingClientRect().height || 0)),
                     text: cards.map(c => c.querySelector(".mc-conv-browser")?.contentDocument?.getElementById("messagepane")?.contentDocument?.querySelector(".moz-text-plain, .moz-text-flowed, pre")?.textContent.trim().slice(0, 12)),
                     note: !!box.querySelector(".mc-conv-note"),
                     // Kapsel „Aktionen beim Überfahren“ in jeder Karte (wirkt auf die Mail der Karte)
                     hover: cards.filter(c => c.querySelector(".mc-conv-browser")?.contentDocument?.getElementById("mcHoverActions")).length };
          };
          const out = {};
          // kein Aufblitzen: direkt nach dem Auswählen ist Thunderbirds Ansicht verdeckt, bis die Karten da sind
          const pane = a3.document.getElementById("messagePane");
          const tbVisible = () => [a3.document.getElementById("messageBrowser"), a3.document.getElementById("multiMessageBrowser")]
            .some(b => b && !b.hidden && a3.getComputedStyle(b).visibility == "visible");
          select("halo-konv-1@example.invalid"); await new Promise(r => a3.requestAnimationFrame(r));
          out.flash = { early: tbVisible() && !a3.document.getElementById("mcConversation") };
          out.single = await read();
          // Einzelmail ohne Konversation: Thunderbirds Ansicht spätestens nach 400 ms frei
          a3.displayFolder(gesendet.URI); await wait(900);
          const t0 = Date.now(); a3.threadTree.selectedIndex = 0; await until(() => !pane.classList.contains("mc-conv-pending") && tbVisible(), 2000);
          out.flash.single = Date.now() - t0;
          a3.displayFolder(eingang.URI); await wait(900);
          // zugeklappter Faden: Konversation statt Zusammenfassung
          a3.threadTree.selectedIndex = -1; await wait(300); a3.goDoCommand?.("cmd_collapseAllThreads"); await wait(600);
          select("halo-konv-3@example.invalid"); out.thread = await read();
          // aus: Thunderbirds Einzelansicht
          Services.prefs.setBoolPref("extensions.mailcards.fullConversation", false);
          a3.threadTree.selectedIndex = -1; await wait(300); select("halo-konv-1@example.invalid"); await wait(1500);
          out.off = !!a3.document.getElementById("mcConversation");
          Services.prefs.clearUserPref("extensions.mailcards.fullConversation"); a3.threadTree.selectedIndex = -1; await wait(300);
          return out;""")
        s1, th = res.get("single") or {}, res.get("thread") or {}
        ok = (s1.get("ids") == ["halo-konv-2", "halo-konv-1"] and s1.get("own") == [True, False] and all(h > 100 for h in s1.get("heights", [0]))
              and s1.get("count") == "2 messages" and (s1.get("text") or [None])[0] == "Text von Hal" and not s1.get("note")
              and th.get("ids") == ["halo-konv-4", "halo-konv-3"] and res.get("off") is False
              and s1.get("hover") == 2 and th.get("hover") == 2
              and res.get("flash", {}).get("early") is False and res["flash"].get("single", 9999) <= 600)
        return ok, f"{res}"
    check("Leseansicht: ganze Konversation (auch eigene Antwort aus „Gesendet“) als Karten, neueste oben, auch für zugeklappte Fäden, Kapsel je Karte; abschaltbar", conversation, results)

    def star_list_header():
        # Stern wie Apples Fahne: in der Liste einfarbig in --mt-star (gewählt mit Fokus weiß), im Mailkopf vor der
        # Uhrzeit nur bei markierten Mails; folgt Änderungen sofort
        res = m.js(READING_JS + r"""
          const color = (dd, v) => { const e = dd.createElement("div"); e.style.color = v; dd.documentElement.append(e); const c = cs(e).color; e.remove(); return c; };
          const doc = await showMail("Halo Jetzt");
          const hdr = doc.defaultView.gMessage;
          const out = { want: color(a3.document, "var(--mt-star)"), white: color(a3.document, "var(--mt-accent-text)") };
          const star = () => doc.querySelector("#mcHdrMeta .mc-hdr-star");
          out.before = !!star() && vis(star());
          hdr.folder.markMessagesFlagged([hdr], true); await wait(500);
          out.header = { shown: vis(star()), bg: star() && cs(star()).backgroundColor,
                         under: !!star() && (() => { const a = star().getBoundingClientRect(), b = doc.getElementById("dateLabel").getBoundingClientRect();
                           return a.top >= b.bottom - 1 && Math.abs(a.right - b.right) <= 2; })(),
                         rects: !!star() && [star().getBoundingClientRect(), doc.getElementById("dateLabel").getBoundingClientRect()].map(r => [r.top, r.right, r.bottom].map(Math.round)) };
          const row = () => a3.document.querySelector('#threadTree tr.selected[data-properties~="flagged"]');
          const img = () => row()?.querySelector(".tree-button-flag img") || row()?.querySelector(".button-star");
          // gewählt ohne Fokus: Sternfarbe; mit Fokus: weiß
          doc.documentElement.focus?.(); a3.document.activeElement?.blur?.(); await wait(300);
          a3.threadTree.blur?.(); await wait(300);
          out.unfocused = img() ? [cs(img()).fill, cs(img()).stroke] : null;
          w.focus(); a3.threadTree.focus(); await wait(400);
          out.focused = img() ? [cs(img()).fill, cs(img()).stroke] : null;
          out.focusOk = a3.threadTree.matches(":focus-within");
          hdr.folder.markMessagesFlagged([hdr], false); await wait(500);
          out.after = !!star() && vis(star());
          return out;""")
        h = res.get("header") or {}
        ok = (res.get("before") is False and h.get("shown") and same_color(h.get("bg") or "", res["want"]) and h.get("under")
              and res.get("after") is False and res.get("unfocused") and all(same_color(c, res["want"]) for c in res["unfocused"]))
        if res.get("focusOk"):
            ok = ok and res.get("focused") and all(same_color(c, res["white"]) for c in res["focused"])
        return ok, f"{res}"
    check("Mailliste und Mailkopf: Stern einfarbig in --mt-star (gewählt mit Fokus weiß), im Kopf rechts unter der Uhrzeit nur bei markierten Mails", star_list_header, results)

    def starred_mailbox():
        # Favoriten: „Starred“ über alle Konten wie Apples „Markiert“ – nur, solange es markierte Mails gibt
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Kontakt");
          const hdr = doc.defaultView.gMessage;
          const tree = a3.document.getElementById("folderTree");
          const row = () => tree.querySelector('li[data-mode="smart"] li[data-mc-starred]');
          const shown = () => !!row() && vis(row());
          for (const h of [...f.messages]) if (h.isFlagged) f.markMessagesFlagged([h], false);
          await wait(1500);
          const out = { before: shown() };
          f.markMessagesFlagged([hdr], true);
          await until(shown, 4000);
          out.flagged = { shown: shown(), name: row()?.querySelector(".name")?.textContent,
                          afterSent: row()?.previousElementSibling?.dataset.folderType };
          if (row()) {
            a3.displayFolder(row().uri); await until(() => a3.gDBView?.rowCount >= 1, 6000); await wait(800);
            out.view = { rows: a3.gDBView?.rowCount, subject: a3.gDBView?.getMsgHdrAt(0)?.mime2DecodedSubject,
                         title: w.document.querySelector("#mcListHeader .mc-lh-title")?.textContent };
          }
          f.markMessagesFlagged([hdr], false);
          await until(() => !shown(), 4000);
          out.after = shown();
          // im Bereich „Alle Ordner“ taucht der Suchordner nie auf
          out.hiddenInAll = [...tree.querySelectorAll('li[data-mode="all"] li')].filter(li => /halo\.spaces starred/.test(li.uri || "") && vis(li)).length;
          a3.displayFolder(f.URI); await wait(800);
          return out;""")
        fl, v = res.get("flagged") or {}, res.get("view") or {}
        ok = (res.get("before") is False and fl.get("shown") and fl.get("name") in ("Starred", "Markiert")
              and v.get("rows") == 1 and v.get("subject") == "Halo Kontakt" and res.get("after") is False and res.get("hiddenInAll") == 0)
        return ok, f"{res}"
    check("Ordnerliste: „Starred“ unter Favoriten über alle Konten, nur solange es markierte Mails gibt, zeigt die markierten Mails", starred_mailbox, results)

    def sort_menu():
        # „Sort by“ wie Apple Mail: neun Sortierungen, Richtung je Sortierung benannt, Gruppierung mit Apples Begriffen;
        # „Starred First“ = Stern-Mails oben, darunter nach Datum
        res = m.js(READING_JS + r"""
          await showMail("Halo Kontakt");
          const ad = a3.document;
          const popup = ad.getElementById("menu_threadPaneSortPopup");
          const show = async () => { popup.dispatchEvent(new a3.Event("popupshowing")); await wait(200); };
          const visible = () => [...popup.querySelectorAll('menuitem[name="sortby"]')].filter(x => !x.hidden).map(x => x.id.replace(/^threadPaneSortBy|Menuitem$/g, ""));
          const dir = () => [ad.getElementById("threadPaneSortAscending").label, ad.getElementById("threadPaneSortDescending").label];
          const out = {};
          a3.sortController.sortThreadPane("dateCol"); a3.sortController.sortDescending(); await wait(400);
          await show(); out.date = { items: visible(), dir: dir(),
            grouping: ["threadPaneSortThreaded", "threadPaneSortUnthreaded", "threadPaneGroupBySort"].map(id => ad.getElementById(id)?.label) };
          a3.sortController.sortThreadPane("subjectCol"); await wait(300); await show(); out.subject = dir();
          // Stern zuerst: vorige Sortierung (Datum) wird die zweite
          const hs = [...f.messages];
          const flagged = hs.find(h => (h.mime2DecodedSubject || "").includes("Halo Viele"));
          f.markMessagesFlagged([flagged], true); await wait(300);
          a3.sortController.sortThreadPane("dateCol"); a3.sortController.sortDescending(); await wait(300);
          a3.sortController.sortThreadPane("flaggedCol"); a3.sortController.sortAscending(); await wait(400);
          await show(); out.star = { dir: dir(), checkedAsc: ad.getElementById("threadPaneSortAscending").hasAttribute("checked"),
            first: a3.gDBView.getMsgHdrAt(0)?.mime2DecodedSubject };
          // ausgeblendete, aber aktive Sortierung bleibt mit Haken sichtbar
          a3.sortController.sortThreadPane("priorityCol"); await wait(300); await show();
          out.priority = visible().includes("Priority");
          f.markMessagesFlagged([flagged], false);
          a3.sortController.sortThreadPane("dateCol"); a3.sortController.sortDescending(); await wait(300);
          await show(); out.back = visible().length;
          return out;""")
        d = res.get("date") or {}
        want = ["Attachments", "Date", "Flag", "From", "Size", "Subject", "Recipient", "Unread", "Tags"]
        ok = (d.get("items") == want and d.get("dir") in (["Oldest Message on Top", "Newest Message on Top"], ["Älteste Nachricht oben", "Neueste Nachricht oben"])
              and res.get("subject") in (["A to Z", "Z to A"], ["A bis Z", "Z bis A"])
              and (res.get("star") or {}).get("first", "").startswith("Halo Viele") and (res.get("star") or {}).get("dir", [""])[0] in ("Starred First", "Markierte zuerst")
              and res.get("priority") is True and res.get("back") == 9
              and (d.get("grouping") or [None])[0] in ("Organize by Conversation", "Nach Konversation ordnen"))
        return ok, f"{res}"
    check("Mailliste: Sortiermenü mit neun Sortierungen wie Apple Mail, Richtung je Sortierung benannt, Stern zuerst mit Datum als zweiter Sortierung", sort_menu, results)

    def attachment_header():
        # Anhänge: Kopfzeile als leise Überschrift (klein, grau, ohne Pfeil und Büroklammer), „Save All“ als Textknopf in
        # Akzentfarbe mit kleinem ⌄ direkt dahinter; kurze Mail: Liste direkt unter dem Text statt am unteren Rand
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Anhänge");
          doc.defaultView.toggleAttachmentList?.(false); await wait(600);
          const g = id => doc.getElementById(id);
          const accent = (() => { const e = doc.createElement("div"); e.style.color = "AccentColor"; doc.documentElement.append(e); const c = cs(e).color; e.remove(); return c; })();
          const save = [g("attachmentSaveAllMultiple"), g("attachmentSaveAllSingle")].find(vis);
          const text = save?.querySelector(".toolbarbutton-text");
          const drop = save?.querySelector(".toolbarbutton-menubutton-dropmarker");
          const name = doc.querySelector("#attachmentList .attachmentItem .attachmentcell-name, #attachmentList .attachmentItem");
          const mp = g("messagepane"), view = g("attachmentView");
          const body = mp.contentDocument.body;
          const out = { toggle: vis(g("attachmentToggle")), icon: vis(g("attachmentIcon")),
            count: { size: cs(g("attachmentCount")).fontSize, color: cs(g("attachmentCount")).color, text: cs(doc.getElementById("messageHeader")).color },
            save: save && { bg: cs(save).backgroundColor, color: text && cs(text).color, accent, size: text && cs(text).fontSize,
                            gap: text && drop && vis(drop) ? Math.round(drop.getBoundingClientRect().left - text.getBoundingClientRect().right) : null,
                            dropBorder: drop && cs(drop).borderInlineStartWidth },
            gap: Math.round(view.getBoundingClientRect().top - (mp.getBoundingClientRect().top + body.getBoundingClientRect().bottom)),
            paneH: Math.round(g("messagepanebox").getBoundingClientRect().height) };
          // Menü über ⌄ erreichbar
          if (drop && vis(drop)) { save.open = true; await wait(500); out.menu = save.querySelector("menupopup")?.state; save.querySelector("menupopup")?.hidePopup(); await wait(300); }
          return out;""")
        c, sv = res.get("count") or {}, res.get("save") or {}
        ok = (res.get("toggle") is False and res.get("icon") is False and c.get("size") == "11px" and not same_color(c.get("color", ""), c.get("text", ""))
              and sv.get("size") == "11px" and same_color(sv.get("color") or "", sv.get("accent") or "x") and sv.get("bg") in ("rgba(0, 0, 0, 0)", "transparent")
              and sv.get("gap") is not None and sv["gap"] <= 6 and res.get("menu") in ("open", "showing")
              and res.get("gap", 999) <= 40)
        return ok, f"{res}"
    check("Anhänge: Kopfzeile als leise Überschrift, „Save All“ als Textknopf in Akzentfarbe mit ⌄ zum Menü; kurze Mail: Liste direkt unter dem Text", attachment_header, results)

    def quick_reply_setting():
        # Schnellantwort: Standard an, in den Einstellungen abschaltbar (wirkt sofort); nie bei eigenen Mails
        res = m.js(READING_JS + r"""
          const doc = await showMail("Halo Kontakt");
          const has = () => vis(md().getElementById("mcQuickReply"));
          const out = { on: has() };
          // „More …“ öffnet das normale Antwortfenster
          const known = new Set(Services.wm.getEnumerator("msgcompose"));
          md().querySelector("#mcQuickReply .mc-qr-more")?.click();
          const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => !known.has(x) && x.document.readyState == "complete" && x.gMsgCompose), 10000);
          if (cw) { await wait(1000); out.more = cw.document.getElementById("msgSubject")?.value; cw.close(); await wait(800); }
          Services.prefs.setBoolPref("extensions.mailcards.quickReply", false); await wait(400);
          out.off = has();
          Services.prefs.clearUserPref("extensions.mailcards.quickReply"); await wait(400);
          out.back = has();
          // eigene Mail im Posteingang (Absender = eigene Identität): kein Feld
          const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
          let added = null;
          if (!MailServices.accounts.allIdentities.some(i => i.email == "halo@example.invalid")) {
            added = MailServices.accounts.createIdentity(); added.fullName = "Halo Test"; added.email = "halo@example.invalid"; acc.addIdentity(added); }
          if (![...f.messages].some(h => h.messageId == "halo-kopf-eigen@example.invalid")) {
            f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(raw({ id: "halo-kopf-eigen", from: "Halo Test <halo@example.invalid>", to: "Anna Beispiel <anna@example.invalid>", subject: "Halo Eigene" }));
            await wait(800);
          }
          await showMail("Halo Eigene"); out.own = has();
          // (die einzige Identität eines Kontos lässt Thunderbird nicht entfernen)
          if (added) try { acc.removeIdentity(added); } catch {}
          return out;""")
        sections = open(os.path.join(ROOT, "extension", "options", "sections.js"), encoding="utf-8").read()
        ok = (res.get("on") is True and res.get("off") is False and res.get("back") is True and res.get("own") is False
              and (res.get("more") or "").startswith("Re:")
              and 'key: "quickReply"' in sections)
        return ok, f"{res}"
    check("Schnellantwort: Standard an, „More …“ öffnet die Antwort, Schalter in den Einstellungen wirkt sofort, nie bei eigenen Mails", quick_reply_setting, results)

    def conversation_cards():
        # Konversation wie Apple Mail: ältere gelesene Mails eingeklappt (ohne geladene Mail, Klick klappt auf), Karte mit einem
        # Anhang nicht abgeschnitten, eine Schnellantwort (neueste fremde Mail), Kapsel je Karte wirkt auf deren Mail,
        # Löschen nur dieser Mail; „Neueste Nachricht oben“ abschaltbar
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
          if (!acc.identities.length) { const id = MailServices.accounts.createIdentity(); id.fullName = "Halo Test"; id.email = "halo@example.invalid"; acc.addIdentity(id); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("KonvKarten")) { root.createSubfolder("KonvKarten", null); await wait(800); }
          const f = root.getChildNamed("KonvKarten");
          const b = "----=_halo_konvkarte";
          const mail = (from, subject, id, refs, minutesAgo, attach) => unescape(encodeURIComponent([`From: ${from}`, `To: Halo Test <halo@example.invalid>`, `Subject: ${subject}`,
            `Date: ${new Date(Date.now() - minutesAgo * 60000).toUTCString().replace("GMT", "+0000")}`, `Message-ID: <${id}@example.invalid>`,
            ...(refs ? [`In-Reply-To: <${refs}@example.invalid>`, `References: <${refs}@example.invalid>`] : []), "MIME-Version: 1.0",
            ...(attach ? [`Content-Type: multipart/mixed; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain; charset=UTF-8", "", "Mit einem Anhang.",
                          `--${b}`, 'Content-Type: text/plain; name="Plakat.txt"', 'Content-Disposition: attachment; filename="Plakat.txt"', "Content-Transfer-Encoding: base64", "",
                          btoa("Erfundene Testdatei"), `--${b}--`, ""]
                       : ["Content-Type: text/plain; charset=UTF-8", "", `Text von ${from.split(" ")[0]}.`, ""])].join("\r\n")));
          if (!f.getTotalMessages(false)) {
            const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
            lf.addMessage(mail("Ben Muster <ben@example.invalid>", "Halo Karten", "halo-karte-1", null, 30));
            lf.addMessage(mail("Halo Test <halo@example.invalid>", "Re: Halo Karten", "halo-karte-2", "halo-karte-1", 20, true));
            lf.addMessage(mail("Ben Muster <ben@example.invalid>", "Re: Halo Karten", "halo-karte-3", "halo-karte-2", 10));
            await wait(1000);
          }
          const hdrs = () => [...f.messages];
          const byId = id => hdrs().find(h => h.messageId == `${id}@example.invalid`);
          f.markMessagesRead([byId("halo-karte-1")], true);
          f.markMessagesRead([byId("halo-karte-2"), byId("halo-karte-3")], false);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(900);
          a3.gViewWrapper.showThreaded = true; await wait(500);
          const select = id => { const i = [...Array(a3.gDBView.rowCount).keys()].find(k => a3.gDBView.getMsgHdrAt(k)?.messageId == `${id}@example.invalid`); a3.threadTree.selectedIndex = i ?? -1; };
          const cardOf = (box, id) => box.querySelector(`.mc-conv-card[data-message-id="${id}@example.invalid"]`);
          const open = async () => {
            a3.threadTree.selectedIndex = -1; await wait(300);
            select("halo-karte-3");
            const box = await until(() => a3.document.getElementById("mcConversation"), 6000);
            if (!box) return null;
            await until(() => [...box.querySelectorAll(".mc-conv-card:not(.mc-collapsed) .mc-conv-browser")].every(x => parseFloat(x.style.height) > 60), 8000);
            await wait(1200);
            return box;
          };
          const out = {};
          let box = await open();
          if (!box) return { box: false };
          const cards = () => [...box.querySelectorAll(".mc-conv-card")];
          const cdoc = c => c.querySelector(".mc-conv-browser")?.contentDocument;
          out.order = cards().map(c => c.dataset.messageId.split("@")[0]);
          out.collapsed = cards().map(c => c.classList.contains("mc-collapsed"));
          const k1 = cardOf(box, "halo-karte-1");
          out.summary = { browser: !!k1?.querySelector(".mc-conv-browser"), from: k1?.querySelector(".mc-conv-from")?.textContent, preview: k1?.querySelector(".mc-conv-preview")?.textContent };
          // eine Schnellantwort, an der neuesten fremden Mail
          out.reply = cards().filter(c => cdoc(c)?.getElementById("mcQuickReply")).map(c => c.dataset.messageId.split("@")[0]);
          // Kapsel in jeder offenen Karte
          out.capsules = cards().filter(c => cdoc(c)?.getElementById("mcHoverActions")).length;
          // Karte mit einem Anhang: Dateizeile ganz in der Karte
          const k2 = cardOf(box, "halo-karte-2"), b2 = k2?.querySelector(".mc-conv-browser"), d2 = cdoc(k2);
          const item = d2?.querySelector("#attachmentList .attachmentItem");
          const br = b2?.getBoundingClientRect();
          out.attach = item ? { itemBottom: Math.round(br.top + item.getBoundingClientRect().bottom), cardBottom: Math.round(br.bottom), scroll: d2.documentElement.scrollHeight - d2.documentElement.clientHeight } : null;
          // Antworten in der Karte der mittleren (eigenen) Mail: Verfassen-Fenster für genau diese Mail
          const known = new Set(Services.wm.getEnumerator("msgcompose"));
          d2?.querySelector("#mcHoverActions .mc-hover-reply")?.click();
          const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => !known.has(x) && x.gMsgCompose), 8000);
          if (cw) {
            await wait(1200);
            out.compose = { subject: cw.document.getElementById("msgSubject")?.value, refs: cw.gMsgCompose?.compFields?.references || "" };
            cw.gMsgCompose?.compFields && (cw.gContentChanged = false);
            cw.close(); await wait(600);
          }
          // aufklappen per Klick
          k1?.querySelector(".mc-conv-summary")?.click();
          out.expanded = !!(await until(() => k1?.querySelector(".mc-conv-browser") && parseFloat(k1.querySelector(".mc-conv-browser").style.height) > 60, 6000));
          // Löschen in der Karte der ältesten Mail: nur diese Mail
          // (unter Linux in der CI dauert das Laden der aufgeklappten Karte länger)
          await until(() => cdoc(k1)?.getElementById("mcHoverActions") && cdoc(k1).defaultView.gMessage, 12000);
          await wait(500);
          const before = f.getTotalMessages(false);
          cdoc(k1)?.querySelector("#mcHoverActions .mc-hover-delete")?.click(); await wait(1200);
          out.deleted = { before, after: f.getTotalMessages(false), cards: box.isConnected ? cards().length : null,
                          gone: !byId("halo-karte-1") };
          // zurückholen (Rückgängig) für spätere Läufe
          const txn = w.messenger?.transactionManager ?? MailServices.txns?.transactionManager;
          try { w.messenger ? w.messenger.undo(w.msgWindow) : txn?.undoTransaction(); } catch {}
          await wait(1200);
          out.undone = f.getTotalMessages(false);
          // älteste oben
          Services.prefs.setBoolPref("extensions.mailcards.conversationNewestFirst", false);
          box = await open();
          out.oldestFirst = box ? [...box.querySelectorAll(".mc-conv-card")].map(c => c.dataset.messageId.split("@")[0]) : null;
          Services.prefs.clearUserPref("extensions.mailcards.conversationNewestFirst");
          a3.threadTree.selectedIndex = -1; await wait(300);
          return out;""")
        a, cp, dl = res.get("attach") or {}, res.get("compose") or {}, res.get("deleted") or {}
        ok = (res.get("order") == ["halo-karte-3", "halo-karte-2", "halo-karte-1"] and res.get("collapsed") == [False, False, True]
              and (res.get("summary") or {}).get("browser") is False and (res.get("summary") or {}).get("preview") is not None
              and res.get("reply") == ["halo-karte-3"] and res.get("capsules") == 2
              and a and a["itemBottom"] <= a["cardBottom"] and a["scroll"] <= 1
              and (cp.get("subject") or "").startswith("Re:") and "halo-karte-2@" in cp.get("refs", "")
              and res.get("expanded") and dl.get("after") == dl.get("before", 0) - 1 and dl.get("cards") == 2
              and res.get("oldestFirst") == ["halo-karte-1", "halo-karte-2", "halo-karte-3"])
        return ok, f"{res}"
    check("Konversation: ältere gelesene Mails eingeklappt, Karte mit einem Anhang ganz, eine Schnellantwort, Kapsel je Karte für deren Mail, Löschen nur dieser Mail; älteste oben wählbar", conversation_cards, results)


# Verfassen-Fenster und seine Dialoge: Test-Identität (example.invalid, kein Server), Fenster öffnen/schließen,
# Editor-Dialoge (modal) erst nach dem Skript öffnen. Gewartet wird über den Zeitgeber des Moduls –
# solange ein modaler Dialog offen ist, ruhen die Zeitgeber der Fenster.

COMPOSE_CHECK_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const { setTimeout: modTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  const pause = ms => new Promise(r => modTimeout(r, ms));
  const till = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const v = fn(); if (v) return v; await pause(100); } return fn(); };
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await pause(500); }
  const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
  if (!acc.identities.length) { const id = MailServices.accounts.createIdentity(); id.fullName = "Halo Test"; id.email = "halo@example.invalid"; acc.addIdentity(id); }
  const later = fn => w.setTimeout(() => { try { fn(); } catch (e) { console.error("Test:", e); } }, 0);
  const compose = async (o = {}) => {
    const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    fields.to = o.to ?? "Anna Beispiel <anna@example.invalid>"; fields.subject = o.subject ?? "Halo Entwurf";
    if (o.cc) fields.cc = o.cc;
    fields.body = o.body ?? "<p>Hallo Anna,</p><p>das ist ein Testentwurf.</p>";
    params.composeFields = fields; params.identity = acc.identities[0]; params.format = o.plain ? Ci.nsIMsgCompFormat.PlainText : Ci.nsIMsgCompFormat.HTML;
    const before = new Set(Services.wm.getEnumerator("msgcompose"));
    MailServices.compose.OpenComposeWindowWithParams(null, params);
    const cw = await till(() => [...Services.wm.getEnumerator("msgcompose")].find(x => !before.has(x) && x.document.readyState == "complete" && x.gMsgCompose), 12000);
    if (!cw) throw new Error("Verfassen-Fenster nicht offen");
    cw.resizeTo(o.width ?? 1000, 760); await pause(1800); return cw; };
  const closeCompose = async cw => { if (!cw || cw.closed) return; cw.gContentChanged = false; if (cw.gMsgCompose) cw.gMsgCompose.bodyModified = false;
    cw.close(); await till(() => cw.closed, 4000); await pause(300); };
  // mit Verfassen-Fenster: fn(cw, cd), danach das Fenster immer schließen
  const withCompose = async (o, fn) => { const cw = await compose(o); try { return await fn(cw, cw.document); } finally { await closeCompose(cw); } };
  const winUrl = (part, ms = 10000) => till(() => [...Services.wm.getEnumerator(null)].find(x => x.location.href.includes(part) && x.document.readyState == "complete"), ms);
  // Dialog über „Abbrechen“ schließen (die Rechtschreibprüfung gibt nur so ihr Verfassen-Fenster wieder frei)
  const shut = async x => { for (let i = 0; i < 3 && x && !x.closed; i++) {
    try { const dl = x.document.querySelector("dialog"); if (i == 0 && dl?.cancelDialog) dl.cancelDialog(); else x.close(); } catch {}
    await till(() => x.closed, 2000); } await pause(200); };
  // modalen Dialog über einen Befehl öffnen: fn(dw, dd), danach schließen
  const dialog = async (open, part, fn) => { later(open); const dw = await winUrl(part); if (!dw) throw new Error(part + " nicht offen");
    await pause(800); try { return await fn(dw, dw.document); } finally { await shut(dw); } };
  // Fenster nach vorn, damit :focus greift
  const front = async x => { x.focus(); await till(() => Services.focus.activeWindow == x, 3000); await pause(200); };
  const csOf = (el, pseudo) => el.ownerDocument.defaultView.getComputedStyle(el, pseudo);
  // berechnete Farbe eines Werts (AccentColor, var(--mt-…)) im Dokument
  const colorOf = (doc, value, prop = "color") => { const e = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style[prop] = value;
    doc.documentElement.append(e); const c = csOf(e)[prop]; e.remove(); return c; };
  const vis = el => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
  const rgba = c => { const v = (String(c).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = String(c).startsWith("color(") ? 255 : 1;
    return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
  // Farbe über einem Grund gemischt, relative Leuchtdichte, senkrechte Mitte eines Elements
  const over = (fg, bg) => fg.slice(0, 3).map((x, i) => x * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mid = el => { if (!el) return null; const r = el.getBoundingClientRect(); return Math.round((r.top + r.height / 2) * 10) / 10; };
  const dark = w.matchMedia("(prefers-color-scheme: dark)").matches;
  const testFolder = async () => { const root = MailServices.accounts.localFoldersServer.rootFolder;
    if (!root.containsChildNamed("Lesen")) { root.createSubfolder("Lesen", null); await pause(800); } return root.getChildNamed("Lesen"); };"""



def compose_checks(m, results):
    """Verfassen-Fenster und Editor-Dialoge: Kästchen, Anhänge, Textfläche, Hinweisleiste, Felder, Kontakte, Rückfragen,
    Listen, Reiter, Anpassen, Trennlinie, Empfängerzeilen, schmale Symbolleiste."""

    def checkboxes():
        # angehakt mit Haken: data:-Bilder sperrt die CSP der Dialoge (default-src chrome:) – nur die blaue Fläche blieb
        res = m.js(COMPOSE_CHECK_JS + r"""
          const look = (dd, cb) => { const s = csOf(cb.querySelector(".checkbox-check"));
            return { img: s.backgroundImage, fill: s.fill, bg: s.backgroundColor, accent: colorOf(dd, "AccentColor"), accentText: colorOf(dd, "AccentColorText") }; };
          const out = {};
          out.replace = await withCompose({}, cw => dialog(() => cw.goDoCommand("cmd_findReplace"), "EdReplace", async (dw, dd) => {
            const blocked = []; dd.addEventListener("securitypolicyviolation", e => blocked.push(e.blockedURI));
            const cb = dd.getElementById("dialog.wrap"), was = cb.checked;
            cb.checked = false; await pause(100); cb.checked = true; await pause(400);
            const r = look(dd, cb); r.blocked = blocked; cb.checked = was; return r; }));
          const f = await testFolder(); tm.switchToTab(0); await pause(500); const a3 = tm.currentAbout3Pane; a3.displayFolder(f.URI); await pause(800);
          out.folder = await dialog(() => a3.commandController.doCommand("cmd_properties"), "folderProps", async (dw, dd) => {
            const cb = [...dd.querySelectorAll("checkbox")].find(vis), was = cb.checked;
            cb.checked = true; await pause(300); const r = look(dd, cb); cb.checked = was; return r; });
          return out;""")
        def good(r):
            return (r["img"].startswith('url("chrome://') and "data:" not in r["img"]
                    and same_color(r["fill"], r["accentText"]) and same_color(r["bg"], r["accent"]))
        ok = good(res["replace"]) and not res["replace"]["blocked"] and good(res["folder"])
        return ok, f"{res}"
    check("Dialoge: angehakte Kästchen mit Haken (chrome://-Grafik, die CSP sperrt data:) – Suchen/Ersetzen, Ordner-Eigenschaften", checkboxes, results)

    def attachments():
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async (cw, cd) => {
            const atts = [];
            for (const n of ["Halo Anhang eins.txt", "Halo Anhang zwei.txt"]) { const path = PathUtils.join(PathUtils.profileDir, n);
              if (!await IOUtils.exists(path)) await IOUtils.writeUTF8(path, "Erfundene Testdatei\n");
              const a = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment); a.url = PathUtils.toFileURI(path); a.name = n; a.size = 30; atts.push(a); }
            cw.AddAttachments(atts);
            if (!await till(() => cw.gAttachmentBucket?.itemCount >= 2, 5000)) return { attached: false };
            await pause(800);
            const area = cd.getElementById("attachmentArea"), bucket = cd.getElementById("attachmentBucket");
            // ein zweites Testfenster daneben (CI-Job auf demselben Mac) kann den Fokus zurückholen – mehrmals versuchen
            let inactive = true;
            for (let i = 0; i < 4 && inactive; i++) {
              await front(cw); bucket.selectedIndex = 0; bucket.focus(); await till(() => bucket.matches(":focus"), 2000); await pause(300);
              inactive = cw.document.documentElement.matches(":-moz-window-inactive") || !bucket.matches(":focus");
            }
            const item = bucket.querySelector(".attachmentItem[selected]"), s = csOf(item);
            const focused = { focus: bucket.matches(":focus"), bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), outline: s.outlineStyle, border: parseFloat(s.borderTopWidth), inactive };
            cd.getElementById("msgSubject").focus(); await pause(300);
            return { attached: true, focused, unfocused: csOf(item).backgroundColor, accent: colorOf(cd, "AccentColor"),
                     summary: csOf(area.querySelector("summary")).backgroundColor, bucket: csOf(bucket).backgroundColor,
                     header: csOf(cd.getElementById("MsgHeadersToolbar")).backgroundColor, bucketBorder: parseFloat(csOf(bucket).borderTopWidth),
                     size: csOf(cd.getElementById("attachmentBucketSize")).backgroundColor }; });""")
        f = res.get("focused") or {}
        ok = (res.get("attached") and same_color(res["summary"], res["header"]) and same_color(res["bucket"], res["header"]) and res["bucketBorder"] == 0
              and f["radius"] >= 6 and f["outline"] == "none" and f["border"] == 0
              and not same_color(res["unfocused"], res["accent"]) and rgba_alpha(res["size"]) == 0)
        if f.get("inactive"):
            # Fenster trotz mehrerer Versuche nicht aktiv: die Akzentfarbe mit Fokus lässt sich nicht messen
            return ok, f"Testfenster nicht aktiv (anderes Fenster hat den Fokus) – Fokusfarbe übersprungen {res}"
        return ok and f["focus"] and same_color(f["bg"], res["accent"]), f"{res}"
    check("Verfassen: Anhänge auf der Fläche des Fensters, markierte Datei abgerundet ohne Rahmen (unfokussiert grau), Größe ohne Plakette", attachments, results)

    def body():
        # Textfläche in der Fläche des Fensters (dunkel sonst bläulich #2a2a2e); eigene Hintergründe der Mail bleiben
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async (cw, cd) => {
            const ed = cw.GetCurrentEditorElement().contentDocument; const b = ed.body;
            const out = { dark, body: csOf(b).backgroundColor, header: csOf(cd.getElementById("MsgHeadersToolbar")).backgroundColor,
                          area: csOf(cd.getElementById("messageArea")).backgroundColor, box: csOf(cd.getElementById("composeContentBox")).backgroundColor };
            b.setAttribute("bgcolor", "#ffffcc"); await pause(200); out.own = csOf(b).backgroundColor; b.removeAttribute("bgcolor");
            return out; });""")
        ok = same_color(res["area"], res["header"]) and same_color(res["box"], res["header"]) and same_color(res["own"], "rgb(255, 255, 204)")
        # hell bleibt der Körper weiß (bzw. durchsichtig auf weißem Grund)
        ok = ok and (same_color(res["body"], res["header"]) if res["dark"]
                     else rgba_alpha(res["body"]) == 0 or same_color(res["body"], "rgb(255, 255, 255)"))
        return ok, f"{res}"
    check("Verfassen: Textfläche und Fugen in der Fläche des Fensters (dunkel kein zweites Grau), eigene Hintergrundfarbe bleibt", body, results)

    def reminder():
        # Hinweis „Anhang vergessen?“: „Später erinnern“ als Kapsel wie „Anhang hinzufügen“, Leiste ohne violettgrauen Rand
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({ body: "<p>Hallo Anna,</p><p>im Anhang findest du das Dokument (attached).</p>" }, async (cw, cd) => {
            await cw.gAttachmentNotifier.checkForAttachmentKeywords?.();
            const msg = await till(() => cd.querySelector('notification-message[value="attachmentReminder"]'), 6000);
            if (!msg) return { bar: false };
            await pause(800);
            const all = sel => [...msg.querySelectorAll(sel), ...(msg.shadowRoot?.querySelectorAll(sel) || [])].find(vis);
            const b = all("button.notification-button"), t = all("toolbarbutton.notification-button");
            if (!b || !t) return { bar: true, buttons: false };
            const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect(), st = csOf(t);
            const stack = msg.closest(".notificationbox-stack") || cd.querySelector("#compose-notification-bottom .notificationbox-stack");
            return { bar: true, buttons: true, heights: [rb.height, rt.height], mids: [rb.top + rb.height / 2, rt.top + rt.height / 2],
                     radius: parseFloat(st.borderTopLeftRadius), border: parseFloat(st.borderTopWidth),
                     innerBorder: parseFloat(csOf(t.querySelector(".toolbarbutton-menubutton-button")).borderTopWidth),
                     // die gelbe Fläche (Schatten-DOM, fest 4 px) wird vom runden Rand der Leiste zugeschnitten
                     host: parseFloat(csOf(msg).borderTopLeftRadius), clip: csOf(msg).overflowX,
                     container: parseFloat(csOf(msg.shadowRoot.querySelector(".container")).borderTopLeftRadius),
                     stack: stack && csOf(stack).backgroundColor, header: csOf(cd.getElementById("MsgHeadersToolbar")).backgroundColor }; });""")
        ok = (res.get("buttons") and abs(res["heights"][0] - res["heights"][1]) <= 1 and abs(res["mids"][0] - res["mids"][1]) <= 1
              and res["radius"] >= 14 and res["border"] == 0 and res["innerBorder"] == 0
              and res["host"] >= 10 and (res["container"] >= 10 or res["clip"] in ("clip", "hidden"))
              and res["stack"] and same_color(res["stack"], res["header"]))
        return ok, f"{res}"
    check("Verfassen: Hinweis „Anhang vergessen?“ – „Später erinnern“ als Kapsel gleich hoch wie „Anhang hinzufügen“, runde Leiste ohne Rand", reminder, results)

    def dialog_fields():
        # Felder in Dialogen 28 px wie die Auswahllisten daneben, Zahlenfelder bleiben breit genug
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async cw => {
            const out = {};
            out.table = await dialog(() => cw.goDoCommand("cmd_InsertTable"), "EdInsertTable", async (dw, dd) => {
              const rows = dd.getElementById("rowsInput"), wi = dd.getElementById("widthInput"), ml = dd.getElementById("widthPixelOrPercentMenulist");
              const was = wi.value; wi.value = "100"; await pause(100);
              const r = { rows: rows.getBoundingClientRect().height, width: wi.getBoundingClientRect().height, menulist: ml.getBoundingClientRect().height,
                          scroll: wi.scrollWidth, client: wi.clientWidth };
              wi.value = was; return r; });
            out.replace = await dialog(() => cw.goDoCommand("cmd_findReplace"), "EdReplace", async (dw, dd) => dd.getElementById("dialog.findInput").getBoundingClientRect().height);
            return out; });""")
        t = res["table"]
        ok = t["rows"] <= 29 and abs(t["width"] - t["menulist"]) <= 1 and t["scroll"] <= t["client"] and res["replace"] <= 29
        return ok, f"{res}"
    check("Dialoge: Eingabefelder 28 px hoch wie die Auswahllisten daneben, „100“ im Zahlenfeld ganz sichtbar", dialog_fields, results)

    def contacts():
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async (cw, cd) => {
            cw.toggleContactsSidebar();
            const d2 = await till(() => { const b = cd.getElementById("contactsBrowser"); const x = b?.contentDocument;
              return x?.readyState == "complete" && x.getElementById("abResultsTree") && x; }, 6000);
            if (!d2) return { open: false };
            await pause(1000);
            const tree = d2.getElementById("abResultsTree"), list = d2.getElementById("addressbookList"), label = d2.querySelector("label[control]");
            const head = cd.querySelector("#contactsSidebar > .sidebar-header");
            return { open: true, tree: csOf(tree).backgroundColor, root: csOf(d2.documentElement).backgroundColor,
                     listBorder: parseFloat(csOf(list).borderTopWidth), listRadius: parseFloat(csOf(list).borderTopLeftRadius),
                     labelMargin: label && parseFloat(csOf(label).marginInlineStart),
                     headLine: csOf(head).borderBottomColor, line: colorOf(cd, "var(--mt-pane-line)") }; });""")
        ok = (res.get("open") and (rgba_alpha(res["tree"]) == 0 or same_color(res["tree"], res["root"])) and not same_color(res["tree"], "rgb(0, 0, 0)")
              and res["listBorder"] == 0 and res["listRadius"] >= 12 and (res["labelMargin"] or 0) >= 6 and same_color(res["headLine"], res["line"]))
        return ok, f"{res}"
    check("Verfassen: Kontakte-Seitenleiste durchgehend im Seitenleisten-Grau, Adressbuch-Auswahl als Kapsel, Abstand zum Rand", contacts, results)

    def common_dialog():
        # Rückfragen (hier die des Verfassen-Fensters wie „Speichern?“) dunkel neutral wie die übrigen Dialoge,
        # ohne violettgrauen Farbstich; hell weiß. Sie gehört nicht zum Hauptfenster – Marionette lässt sie offen
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async cw => {
            let done = false;
            cw.setTimeout(() => Services.prompt.asyncConfirm(cw.browsingContext, Services.prompt.MODAL_TYPE_WINDOW, "Halo", "Test")
              .finally(() => { done = true; }), 0);
            const dw = await winUrl("commonDialog");
            if (!dw) return { open: false };
            await pause(600);
            const dl = dw.document.querySelector("dialog");
            const own = csOf(dl).backgroundColor, rootBg = csOf(dw.document.documentElement).backgroundColor;
            dl.cancelDialog(); await till(() => done && dw.closed, 4000);
            return { open: true, dark, dialog: own, root: rootBg, visible: rgba(own)[3] > 0 ? own : rootBg }; });""")
        c = res.get("visible", "")
        import re
        v = [float(x) for x in re.findall(r"-?[\d.]+", c)][:3]
        if res.get("dark"):
            ok = len(v) == 3 and max(abs(v[0] - v[1]), abs(v[1] - v[2]), abs(v[0] - v[2])) <= 3 and not same_color(c, "rgb(66, 65, 77)")
        elif sys.platform == "darwin":
            ok = len(v) == 3 and min(v) >= 250
        else:
            # hell bleibt Thunderbirds Fläche – unter Linux das helle Grau von GTK (246, 245, 244)
            ok = len(v) == 3 and min(v) >= 240 and max(v) - min(v) <= 3
        return bool(res.get("open")) and ok, f"{res}"
    check("Rückfragen: neutrale Fläche (dunkel ohne violettgrauen Farbstich, hell weiß)", common_dialog, results)

    def lists():
        # Listen in Dialogen ohne harten macOS-Rahmen, Auswahl abgerundet in Akzentfarbe (unfokussiert grau)
        res = m.js(COMPOSE_CHECK_JS + r"""
          const out = {};
          out.spell = await withCompose({ body: "<p>Ein Tset mit Fehlrn und noch mehr Fehlren.</p>" }, cw =>
            dialog(() => cw.goDoCommand("cmd_spelling"), "EdSpellCheck", async (dw, dd) => {
              await pause(600);
              const list = dd.getElementById("SuggestedList");
              if (!list.itemCount) list.appendItem("Probe");
              if (list.selectedIndex < 0) list.selectedIndex = 0;
              await front(dw); list.focus(); await pause(300);
              const item = list.selectedItem;
              const r = { appearance: csOf(list).appearance, radius: parseFloat(csOf(item).borderTopLeftRadius), focus: list.matches(":focus"),
                          focused: csOf(item).backgroundColor, accent: colorOf(dd, "AccentColor") };
              dd.getElementById("ReplaceWordInput").focus(); await pause(300); r.unfocused = csOf(item).backgroundColor;
              return r; }));
          // Filter-Editor: Zeilen mit Menülisten und Feldern behalten ihre Farben
          const f = await testFolder(); w.MsgFilters(null, f);
          const lw = await winUrl("FilterListDialog"); if (!lw) throw new Error("Filterliste nicht offen");
          await pause(1000);
          try {
            out.filter = await dialog(() => lw.onNewFilter(), "FilterEditor", async (dw, dd) => {
              // „Apply filter when:“ bündig und gleich groß wie „Filter name:“, Kästchen eingerückt
              const leg = dd.querySelector("#applyFiltersSettings > legend"), lab = dd.getElementById("filterName").previousElementSibling,
                    cb = dd.getElementById("runManual");
              return { terms: csOf(dd.getElementById("searchTermList")).appearance, actions: csOf(dd.getElementById("filterActionList")).appearance,
                       legend: [leg.getBoundingClientRect().left, parseFloat(csOf(leg).fontSize), parseInt(csOf(leg).fontWeight)],
                       label: [lab.getBoundingClientRect().left, parseFloat(csOf(lab).fontSize)], box: cb.getBoundingClientRect().left }; });
          } finally { await shut(lw); }
          return out;""")
        s, f = res["spell"], res["filter"]
        ok = (s["appearance"] == "none" and s["radius"] >= 6 and s["focus"] and same_color(s["focused"], s["accent"])
              and not same_color(s["unfocused"], s["accent"]) and f["terms"] == "none" and f["actions"] == "none"
              and abs(f["legend"][0] - f["label"][0]) <= 1 and abs(f["legend"][1] - f["label"][1]) < 0.5
              and 500 <= f["legend"][2] <= 650 and f["box"] >= f["legend"][0] + 8)
        return ok, f"{res}"
    check("Dialoge: Listen ohne harten Rahmen, Auswahl abgerundet in Akzentfarbe (Rechtschreibung), Filter-Editor ohne macOS-Rahmen, „Apply filter when:“ bündig und gleich groß", lists, results)

    def tabs():
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, cw => dialog(() => cw.goDoCommand("cmd_image"), "EdImageProps", async (dw, dd) => {
            const tabs = dd.querySelector("tabs"), t = tabs.querySelector("tab[selected]"), u = tabs.querySelector("tab:not([selected])");
            const s = csOf(t), after = csOf(t, "::after");
            return { bottom: parseFloat(s.borderBottomWidth), radius: parseFloat(s.borderTopLeftRadius), bg: s.backgroundColor,
                     control: colorOf(dd, "var(--mt-control)", "backgroundColor"), after: [after.display, after.content],
                     tabsLine: parseFloat(csOf(tabs).borderBottomWidth), other: csOf(u).backgroundColor }; }));""")
        ok = (res["bottom"] == 0 and res["radius"] >= 12 and same_color(res["bg"], res["control"])
              and (res["after"][0] == "none" or res["after"][1] == "none") and res["tabsLine"] == 0 and rgba_alpha(res["other"]) == 0)
        return ok, f"{res}"
    check("Dialoge: Reiter als Segment-Kapseln ohne Strich und Linie (Bild einfügen)", tabs, results)

    def customize():
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async (cw, cd) => {
            cw.CustomizeMailToolbar("compose-toolbox", "CustomizeComposeToolbar");
            // macOS als Sheet im Fenster, Linux/Windows als eigenes Fenster (toolbar.customization.usesheet)
            const frame = cd.getElementById("customizeToolbarSheetIFrame");
            const ready = x => x?.readyState == "complete" && x.getElementById("palette-box")?.querySelector("toolbarspring") && x;
            const d2 = await till(() => ready(frame?.contentDocument)
              || ready([...Services.wm.getEnumerator(null)].find(x => x.location.href.includes("customizeToolbar"))?.document), 8000);
            if (!d2) return { open: false };
            await pause(800);
            const box = d2.getElementById("palette-box"), spring = box.querySelector("toolbarspring"), s = csOf(box);
            const out = { open: true, border: parseFloat(s.borderTopWidth), radius: parseFloat(s.borderTopLeftRadius), bg: s.backgroundColor,
                          spring: [csOf(spring).borderTopStyle, parseFloat(csOf(spring).borderTopLeftRadius)] };
            try { d2.defaultView.onClose(); } catch {} await pause(800);
            return out; });""")
        ok = res.get("open") and res["border"] == 0 and res["radius"] >= 8 and rgba_alpha(res["bg"]) <= 0.15 and res["spring"][0] == "dashed" and res["spring"][1] >= 4
        return ok, f"{res}"
    check("Verfassen: Anpassen-Sheet mit ruhiger Palette ohne Rahmen, Platzhalter gestrichelt und gerundet", customize, results)

    def compose_panels():
        # Rand (und beim Anordnen-Panel die Fläche) neutral wie die Tooltips statt Thunderbirds bläulichem Panelgrau
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, async (cw, cd) => {
            const val = (el, v) => { const x = csOf(el).getPropertyValue(v).trim(); return x ? colorOf(cd, x, "backgroundColor") : ""; };
            const out = { border: colorOf(cd, "var(--mt-tooltip-border)", "backgroundColor"), bg: colorOf(cd, "var(--mt-tooltip-bg)", "backgroundColor") };
            const look = p => p ? { border: val(p, "--panel-border-color"), bg: val(p, "--panel-background-color") } : null;
            for (const id of ["reorderAttachmentsPanel", "customizeToolbarSheetPopup"]) out[id] = look(cd.getElementById(id));
            // Adressvorschläge: die Empfängerfelder legen ein eigenes, namenloses Panel an (nicht #PopupAutoComplete) –
            // in das An-Feld tippen und das tatsächlich offene Panel messen, samt berechnetem Rand der Inhaltsfläche
            const inp = cd.querySelector(".address-row:not(.hidden) input.address-row-input, #toAddrInput");
            inp.focus(); inp.value = "an"; inp.controller.handleText();
            await till(() => inp.controller.matchCount > 0, 5000);
            if (inp.popup.state != "open") inp.openPopup();
            const ac = await till(() => [...cd.querySelectorAll('panel[type="autocomplete-richlistbox"]')].find(p => p.state == "open"), 4000);
            out.autocomplete = look(ac);
            if (ac) { out.autocomplete.id = ac.id; const c = ac.shadowRoot?.querySelector('[part~="content"]');
              out.autocomplete.content = c ? csOf(c).borderTopColor : null; ac.hidePopup(); }
            inp.value = ""; await pause(300);
            return out; });""")
        ids = ["reorderAttachmentsPanel", "autocomplete", "customizeToolbarSheetPopup"]
        # Thunderbirds Panelrand #5e7799 / #91939f und Panelfläche #262d3b (Deckkraft egal)
        rgb = lambda c: "rgb(" + ", ".join(__import__("re").findall(r"-?[\d.]+", c or "")[:3]) + ")"
        bluish = lambda c: any(same_color(rgb(c), t, 4) for t in ["rgb(94, 119, 153)", "rgb(145, 147, 159)", "rgb(38, 45, 59)"])
        ac = res.get("autocomplete") or {}
        # Adressvorschläge: auch die Fläche unter der halbtransparenten Haarlinie neutral (sonst färbt sie den Rand bläulich)
        ok = (ac.get("bg") and not bluish(ac["bg"]) and all(res.get(i) and same_color(res[i]["border"], res["border"]) and not bluish(res[i]["border"]) for i in ids)
              and (ac.get("content") is None or (same_color(ac["content"], res["border"]) and not bluish(ac["content"])))
              and same_color(res["reorderAttachmentsPanel"]["bg"], res["bg"]) and not bluish(res["reorderAttachmentsPanel"]["bg"]))
        return ok, f"{res}"
    check("Verfassen: Anhänge-anordnen-Panel neutral wie Tooltips, Adressvorschläge und Anpassen-Sheet mit Haarlinie statt bläulichem Rand", compose_panels, results)

    def format_toolbox():
        # Reintext: Thunderbird blendet nur die Formatleiste aus – die leere Box darf keine zweite Linie unter den Betreff legen;
        # Farbfelder: dezenter Rand statt Thunderbirds rgba(255, 255, 255, 0.7), Ring in Fensterfarbe trennt Text- und Hintergrundfeld
        # (Formatleiste ist wie bei Apple Mail erst über „Aa“ sichtbar – für die Messung einblenden)
        res = m.js(COMPOSE_CHECK_JS + r"""
          Services.prefs.setBoolPref("extensions.mailcards.composeFormatBar", true);
          const html = await withCompose({}, async (cw, cd) => {
            const box = cd.getElementById("FormatToolbox"), t = cd.getElementById("TextColorButton"), b = cd.getElementById("BackgroundColorButton");
            return { line: parseFloat(csOf(box).borderBottomWidth), style: csOf(box).borderBottomStyle,
                     shadow: csOf(t).boxShadow, window: colorOf(cd, "var(--mt-window)"), swatch: colorOf(cd, "var(--mt-swatch-border)"),
                     borders: [csOf(t).borderTopColor, csOf(b).borderTopColor] }; });
          const plain = await withCompose({ plain: true, body: "Hallo Anna,\n\ndas ist ein Testentwurf." }, async (cw, cd) => {
            const box = cd.getElementById("FormatToolbox");
            return { barHidden: cd.getElementById("FormatToolbar").hidden, line: parseFloat(csOf(box).borderBottomWidth), style: csOf(box).borderBottomStyle }; });
          Services.prefs.clearUserPref("extensions.mailcards.composeFormatBar");
          return { html, plain };""")
        h, p = res["html"], res["plain"]
        ok = (h["line"] > 0 and h["style"] != "none" and p["barHidden"] and (p["line"] == 0 or p["style"] == "none")
              and h["window"] in h["shadow"] and all(same_color(c, h["swatch"]) and not same_color(c, "rgba(255, 255, 255, 0.7)") for c in h["borders"]))
        return ok, f"{res}"
    check("Verfassen: Formatleiste mit einer Haarlinie, im Reintext keine zweite Linie unter dem Betreff; Farbfelder mit dezentem Rand und Ring in Fensterfarbe", format_toolbox, results)

    def separator():
        res = m.js(COMPOSE_CHECK_JS + r"""
          return await withCompose({}, cw => dialog(() => cw.goDoCommand("cmd_link"), "EdLinkProps", async (dw, dd) => {
            const s = dd.getElementById("advancedSeparator");
            return { border: csOf(s).borderTopWidth, height: s.getBoundingClientRect().height, bg: csOf(s).backgroundColor,
                     line: colorOf(dd, "var(--mt-pane-line)", "backgroundColor") }; }));""")
        ok = res["border"] == "0px" and res["height"] <= 1 and same_color(res["bg"], res["line"])
        return ok, f"{res}"
    check("Dialoge: Trennlinie über OK/Abbrechen als Haarlinie (Link einfügen)", separator, results)

    # Empfängerzeilen: vier Empfänger in An (bricht bei 860 px um), einer in Cc, Bcc leer eingeblendet – ein Fenster für drei Prüfungen
    rcpt = {}

    def recipients():
        if not rcpt:
            rcpt.update(m.js(COMPOSE_CHECK_JS + r"""
              const to = "Anna Beispiel <anna@example.invalid>, Ben Muster <ben@example.invalid>, Carla Ölmann <carla@example.invalid>, "
                + "Dr. Maximilian Alexander von Langenname-Überlänge <maximilian.von.langenname@example.invalid>";
              return await withCompose({ to, cc: "Projektteam <team@example.invalid>", width: 860 }, async (cw, cd) => {
                const pills = () => [...cd.querySelectorAll("#toAddrContainer mail-address-pill")];
                const top = p => Math.round(p.getBoundingClientRect().top), left = p => Math.round(p.getBoundingClientRect().left * 10) / 10;
                const rows = () => new Set(pills().map(top)).size;
                for (const width of [760, 680]) { if (rows() >= 2) break; cw.resizeTo(width, 760); await pause(800); }
                cw.showAndFocusAddressRow("addressRowBcc"); await pause(500);
                const all = pills(), first = all[0], textLeft = el => el.getBoundingClientRect().left + parseFloat(csOf(el).paddingLeft);
                const bar = csOf(cd.getElementById("MsgHeadersToolbar")).backgroundColor, bcc = cd.querySelector("#bccAddrContainer .address-input");
                const out = { dark, rows: rows(), bar, pill: csOf(first).backgroundColor,
                  to: [mid(cd.getElementById("toAddrLabel")), mid(first)],
                  cc: [mid(cd.getElementById("ccAddrLabel")), mid(cd.querySelector("#ccAddrContainer mail-address-pill"))],
                  bcc: [mid(cd.getElementById("bccAddrLabel")), mid(bcc)],
                  first: left(first), wrapped: all.filter(p => top(p) > top(first) + 4).map(left),
                  bccText: textLeft(bcc), subjectText: textLeft(cd.getElementById("msgSubject")) };
                out.pillLum = lum(over(rgba(out.pill), rgba(bar))); out.barLum = lum(rgba(bar));
                // Zustände ohne Übergang messen (verdeckte Testfenster halten Übergänge an)
                const p = all[1]; p.style.transition = "none";
                p.setAttribute("selected", "selected"); await pause(150); out.selected = csOf(p).backgroundColor; p.removeAttribute("selected");
                p.classList.add("invalid-address"); await pause(150); out.invalid = csOf(p).backgroundColor; p.classList.remove("invalid-address");
                p.style.transition = ""; out.accent = colorOf(cd, "AccentColor");
                return out; });"""))
        return rcpt

    def labels():
        r = recipients()
        # Windows (Segoe UI): die zweizeilige An-Zeile liegt dort bis 3 px anders als Cc/Bcc – zulassen
        tol = 3.5 if sys.platform == "win32" else 1.5
        ok = all(a is not None and b is not None and abs(a - b) <= tol for a, b in (r["to"], r["cc"], r["bcc"]))
        return ok, f"Mitte Beschriftung/Pille: An {r['to']}, Cc {r['cc']}, Bcc leer (Eingabefeld) {r['bcc']}"
    check("Verfassen: „An“, „Cc“ und „Bcc“ auf der Höhe der ersten Pille bzw. des leeren Eingabefelds", labels, results)

    def wrap():
        r = recipients()
        ok = (r["rows"] >= 2 and r["wrapped"] and all(abs(x - r["first"]) <= 0.5 for x in r["wrapped"])
              and abs(r["bccText"] - r["subjectText"]) <= 1)
        return ok, (f"{r['rows']} Zeilen, erste Pille links {r['first']}, umbrochene {r['wrapped']}; "
                    f"Text leeres Bcc {r['bccText']} gegen Betreff {r['subjectText']}")
    check("Verfassen: umbrochene Empfänger-Pillen beginnen bündig mit der ersten, leeres Feld bündig mit dem Betreff", wrap, results)

    def pill_color():
        r = recipients()
        # dunkel heller als die Fläche (vorher dunkler: „Löcher“), hell weiter Thunderbirds Grau (dunkler als die Fläche)
        lighter = r["pillLum"] > r["barLum"] if r["dark"] else r["pillLum"] < r["barLum"]
        ok = lighter and same_color(r["selected"], r["accent"]) and same_color(r["invalid"], "rgb(215, 0, 34)")
        return ok, (f"Pille {r['pill']} auf {r['bar']} (Leuchtdichte {r['pillLum']:.4f} gegen {r['barLum']:.4f}), "
                    f"ausgewählt {r['selected']} (Akzent {r['accent']}), ungültige Adresse {r['invalid']}")
    check("Verfassen: Empfänger-Pillen dunkel heller als die Fläche; Auswahl und Warnfarbe ungültiger Adressen bleiben", pill_color, results)

    def narrow_toolbar():
        # Symbolleiste wie Apple Mail immer nur mit Symbolen (außer „Aa“), auch schmal ohne Überlauf; Formatleiste
        # (eingeblendet) bleibt im Fenster; im Modus „nur Text“ bleiben die Beschriftungen
        res = m.js(COMPOSE_CHECK_JS + r"""
          Services.prefs.setBoolPref("extensions.mailcards.composeFormatBar", true);
          return await withCompose({}, async (cw, cd) => {
            const bar = cd.getElementById("composeToolbar2"), fmt = cd.getElementById("FormatToolbar"), box = cd.getElementById("compose-toolbox");
            const state = () => { const texts = [...bar.querySelectorAll(":scope > toolbarbutton .toolbarbutton-text")].filter(vis);
              return { width: cw.innerWidth, icons: bar.hasAttribute("mc-icons-only"), labels: texts.length,
                       cut: texts.filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.value || t.textContent),
                       overflow: bar.scrollWidth - bar.clientWidth, fmt: [fmt.scrollWidth, fmt.clientWidth],
                       outside: [...fmt.children].filter(c => vis(c) && c.getBoundingClientRect().right > cw.innerWidth + 0.5).map(c => c.id || c.localName) }; };
            const size = async width => { cw.resizeTo(width, 700); await till(() => cw.innerWidth == width, 3000); await pause(900); return state(); };
            const out = { mode: box.getAttribute("mode") };
            out.narrow = await size(640); out.tiny = await size(560); out.wide = await size(1000);
            // Modus „nur Text“: Beschriftungen bleiben auch schmal (sonst leere Knöpfe)
            box.setAttribute("mode", "text"); out.text = await size(640);
            box.setAttribute("mode", out.mode || "full"); await pause(300);
            Services.prefs.clearUserPref("extensions.mailcards.composeFormatBar");
            return out; });""")
        n, t, wd, tx = res["narrow"], res["tiny"], res["wide"], res["text"]
        fits = lambda s: not s["cut"] and s["overflow"] <= 1 and s["fmt"][0] <= s["fmt"][1] + 1 and not s["outside"]
        ok = (n["labels"] <= 1 and fits(n) and t["labels"] <= 1 and fits(t)
              and wd["labels"] <= 1 and fits(wd) and tx["labels"] >= 3)
        return ok, f"{res}"
    check("Verfassen: Symbolleiste nur mit Symbolen (außer „Aa“), auch schmal ohne Überlauf, Formatleiste bleibt im Fenster; Modus „nur Text“ mit Beschriftung", narrow_toolbar, results)

    def apple_compose():
        # Verfassen wie Apple Mail: Symbole mittig, Senden rund rechts, „Aa“ blendet die Formatleiste ein (aus: versteckt),
        # Bezeichnungen links mit Doppelpunkt, kein Konto neben dem Absender; Weiterleitung mit „Begin forwarded message:“,
        # Absender zuerst, Datum in Ortszeit, Kopf ohne Tabellenränder, Balken links; Anhänge als Kacheln (32-px-Symbol)
        res = m.js(COMPOSE_CHECK_JS + r"""
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Weiterleiten")) root.createSubfolder("Weiterleiten", null);
          const f = root.getChildNamed("Weiterleiten");
          if (!f.getTotalMessages(false)) {
            const raw = ["From - Fri Oct 23 11:21:33 2026", "From: Office Beispiel <office@kanzlei.example.invalid>", "To: Halo Test <halo@example.invalid>",
              "Subject: Halo Unterlagen", "Date: Fri, 23 Oct 2026 11:21:33 +0000", "Message-ID: <halo-fwd-1@example.invalid>", "MIME-Version: 1.0",
              'Content-Type: multipart/mixed; boundary="xx"', "", "--xx", "Content-Type: text/html; charset=UTF-8", "", "<p>Sehr geehrter Herr Test,</p><p>anbei.</p>",
              "--xx", 'Content-Type: application/pdf; name="Brief - Ladung.pdf"', 'Content-Disposition: attachment; filename="Brief - Ladung.pdf"', "Content-Transfer-Encoding: base64", "", btoa("%PDF-1.4 test ".repeat(50)),
              "--xx--", ""].join("\r\n");
            f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(raw); await pause(1000);
          }
          const hdr = [...f.messages].find(h => h.messageId == "halo-fwd-1@example.invalid");
          const before = new Set(Services.wm.getEnumerator("msgcompose"));
          MailServices.compose.OpenComposeWindow(null, hdr, f.getUriForMsg(hdr), Ci.nsIMsgCompType.ForwardInline, Ci.nsIMsgCompFormat.HTML, acc.identities[0], null, w.msgWindow);
          const cw = await till(() => [...Services.wm.getEnumerator("msgcompose")].find(x => !before.has(x) && x.document.readyState == "complete" && x.gMsgCompose), 12000);
          if (!cw) return { open: false };
          try {
            cw.resizeTo(1000, 760);
            await till(() => cw.GetCurrentEditorElement?.()?.contentDocument?.querySelector(".moz-forward-container") && cw.document.querySelector("#attachmentBucket > .attachmentItem"), 10000);
            await pause(1800);
            const cd = cw.document, bar = cd.getElementById("composeToolbar2"), send = cd.getElementById("button-send"), aa = cd.getElementById("mcFormatToggle");
            // (der Pfeil „Später senden“ gehört zum Senden-Knopf, nicht zur mittigen Gruppe)
            const btns = [...bar.querySelectorAll(":scope > toolbarbutton")].filter(b => vis(b) && b != send && b.id != "mcSendLater");
            const lefts = btns.map(b => b.getBoundingClientRect().left), rights = btns.map(b => b.getBoundingClientRect().right);
            const sr = send.getBoundingClientRect();
            const out = { open: true, center: Math.round((Math.min(...lefts) + Math.max(...rights)) / 2 - cw.innerWidth / 2),
              send: [Math.round(sr.width), Math.round(sr.height), csOf(send).borderTopLeftRadius, Math.round(cw.innerWidth - sr.right)],
              texts: [...bar.querySelectorAll(":scope > toolbarbutton .toolbarbutton-text")].filter(vis).map(t => t.value || t.textContent),
              fmtHidden: !vis(cd.getElementById("FormatToolbar")) };
            aa.doCommand(); await pause(400); out.fmtShown = vis(cd.getElementById("FormatToolbar")); out.pref = Services.prefs.getBoolPref("extensions.mailcards.composeFormatBar", false);
            aa.doCommand(); await pause(300);
            const lab = cd.getElementById("subjectLabel");
            // ab der Kante des Kopfbereichs (eine offene Kontakte-Seitenleiste schiebt ihn nach rechts)
            out.label = [Math.round(lab.getBoundingClientRect().left - cd.getElementById("MsgHeadersToolbar").getBoundingClientRect().left), cw.getComputedStyle(lab, "::after").content];
            const desc = cd.getElementById("msgIdentity").shadowRoot?.querySelector('[part~="description"]');
            out.desc = desc ? vis(desc) : false;
            const ed = cw.GetCurrentEditorElement().contentDocument, box = ed.querySelector(".moz-forward-container"), table = box.querySelector("table");
            out.fwd = { begin: [...box.childNodes].some(n => n.nodeType == 3 && /Begin forwarded message:/.test(n.data)), first: table.querySelector("tr th")?.textContent.trim(),
                        date: [...table.querySelectorAll("td")].map(td => td.textContent).find(t => /2026/.test(t)), border: ed.defaultView.getComputedStyle(table.querySelector("td")).borderTopStyle,
                        bar: ed.defaultView.getComputedStyle(box).borderInlineStartWidth, modified: cw.gMsgCompose.bodyModified };
            const item = cd.querySelector("#attachmentBucket > .attachmentItem"), icon = item.querySelector(".attachmentcell-icon");
            out.att = { w: Math.round(item.getBoundingClientRect().width), icon: Math.round(icon.getBoundingClientRect().width), src: /size=32/.test(icon.getAttribute("srcset") || "") };
            return out;
          } finally { await closeCompose(cw); }""")
        if not res.get("open"):
            return False, f"{res}"
        fw, at = res["fwd"], res["att"]
        ok = (abs(res["center"]) <= 30 and res["send"][:3] == [30, 30, "50%"] and res["send"][3] <= 36 and res["texts"] == ["Aa"]
              and res["fmtHidden"] and res["fmtShown"] and res["pref"] and res["label"][0] <= 30 and res["label"][1] == '":"' and not res["desc"]
              and fw["begin"] and fw["first"].startswith("From") and fw["date"] and "+0000" not in fw["date"] and fw["border"] == "none"
              and fw["bar"] == "2px" and not fw["modified"] and at["w"] == 96 and at["icon"] == 32 and at["src"])
        return ok, f"{res}"
    check("Verfassen wie Apple Mail: Symbole mittig, Senden rund rechts, „Aa“ für die Formatleiste, Bezeichnungen links; Weiterleitung mit Apple-Kopf; Anhänge als Kacheln", apple_compose, results)


DIALOG_READING_JS = READING_JS + r"""
  const { setTimeout: modT } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  const nap = ms => new Promise(r => modT(r, ms));
  const tillM = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const v = fn(); if (v) return v; await nap(100); } return fn(); };
  const winOf = (part, ms = 10000) => tillM(() => [...Services.wm.getEnumerator(null)].find(x => x.location.href.includes(part) && x.document.readyState == "complete"), ms);
  const colorIn = (doc, value, prop = "color") => { const e = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style[prop] = value;
    (doc.body || doc.documentElement).append(e); const c = doc.defaultView.getComputedStyle(e)[prop]; e.remove(); return c; };"""


def dialog_checks(m, results):
    """Seltene Dialoge: Ordnerwahl der Suchordner, Filterprotokoll, „Ordner komprimieren?“, Filterliste/Suche/OpenPGP,
    Druckvorschau, Gespeicherte Dateien, „Öffnen von …“."""

    def folder_picker():
        # Suchordner → „Choose…“: Liste in der Inhaltsfläche mit Haarlinie (dunkel vorher tiefschwarz), Kästchen im macOS-Stil
        # mit chrome://-Haken (die CSP sperrt data:); im Suchordner-Dialog +/− mittig zur Bedingungszeile
        res = m.js(COMPOSE_CHECK_JS + r"""
          const f = await testFolder(); tm.switchToTab(0); await pause(500); const a3 = tm.currentAbout3Pane; a3.displayFolder(f.URI); await pause(800);
          return await dialog(() => a3.commandController.doCommand("cmd_newVirtualFolder"), "virtualFolderProperties", async (dw, dd) => {
            const row = dd.querySelector("#searchTermList > richlistitem");
            const btn = [...row.querySelectorAll(".small-button")].find(vis), ml = [...row.querySelectorAll("menulist")].find(vis);
            const out = { mids: [mid(btn), mid(ml)] };
            // die Ordnerwahl ist modal zum Dialog – über dessen Zeitgeber öffnen, sonst wartet dieses Skript, bis sie zu ist
            dw.setTimeout(() => dd.getElementById("folderListPicker").click(), 0);
            const lw = await winUrl("virtualFolderListEdit"); if (!lw) return { ...out, picker: false };
            try {
              await pause(1200); const ld = lw.document, t = ld.getElementById("folderPickerTree");
              const cb = await till(() => t.querySelector('input[type="checkbox"]:checked'), 4000);
              const s = csOf(t), c = cb && csOf(cb);
              return { ...out, picker: true, bg: s.backgroundColor, window: colorOf(ld, "var(--mt-window)", "backgroundColor"), radius: s.borderTopLeftRadius,
                       line: s.borderTopColor, paneLine: colorOf(ld, "var(--mt-pane-line)"), cb: c && [c.appearance, c.backgroundImage, c.backgroundColor], accent: colorOf(ld, "AccentColor") };
            } finally { await shut(lw); } }); """)
        ok = (res.get("picker") and same_color(res["bg"], res["window"]) and not same_color(res["bg"], "rgb(0, 0, 0)") and res["radius"] == "8px"
              and same_color(res["line"], res["paneLine"]) and res["cb"] and res["cb"][0] == "none" and res["cb"][1].startswith('url("chrome://')
              and same_color(res["cb"][2], res["accent"]) and None not in res["mids"] and abs(res["mids"][0] - res["mids"][1]) <= 1)
        return ok, f"{res}"
    check("Suchordner: Ordnerwahl in der Inhaltsfläche mit Haarlinie und 8 px, Kästchen im macOS-Stil mit Haken; +/− mittig zur Bedingungszeile", folder_picker, results)

    def filter_windows():
        # Filterliste, Filterprotokoll und Nachrichten suchen sind <window>: Listen und Felder trotzdem mit Haarlinie statt hartem Rahmen;
        # Protokoll dunkel ohne weiße Fläche (Inhaltsprozess, noscroll.css)
        res = m.js(COMPOSE_CHECK_JS + r"""
          const look = el => { const s = csOf(el), dd = el.ownerDocument;
            return { app: s.appearance, radius: s.borderTopLeftRadius, line: s.borderTopColor, paneLine: colorOf(dd, "var(--mt-pane-line)"), img: s.backgroundImage,
                     h: Math.round(el.getBoundingClientRect().height) }; };
          // Spaltenköpfe: ohne Thunderbirds Systemlinie (Schatten unten, Trenner links), Trenner als Haarlinie, erster Kopf ohne Trenner
          const head = (dd, sel) => [...dd.querySelectorAll(sel + " > treecols > treecol")].filter(vis).slice(0, 3).map(c => { const s = csOf(c);
            return { id: c.id, sh: s.boxShadow, bl: s.borderInlineStartWidth, blc: s.borderInlineStartColor }; });
          // Spaltenwahl-Knopf rechts: Trenner links wie die übrigen Köpfe, kein Strich unten (inset-Schatten des Knopfs)
          const pick = (dd, sel) => { const p = dd.querySelector(sel + " > treecols > treecolpicker"); if (!p) return null;
            const s = csOf(p), b = csOf(p.querySelector(".tree-columnpicker-button") ?? p);
            return { sh: s.boxShadow, bsh: b.boxShadow, blc: s.borderInlineStartColor, bb: s.borderBlockEndWidth }; };
          const headOf = (dd, sel) => ({ cols: head(dd, sel), pick: pick(dd, sel), sep: colorOf(dd, "var(--mt-separator)"), bb: csOf(dd.querySelector(sel + " > treecols")).borderBottomColor });
          const out = {};
          const f = await testFolder(); w.MsgFilters(null, f);
          const lw = await winUrl("FilterListDialog"); if (!lw) throw new Error("Filterliste nicht offen");
          try {
            await pause(1000); const ld = lw.document;
            out.list = look(ld.getElementById("filterList")); out.search = look(ld.getElementById("searchBox"));
            out.listHead = headOf(ld, "#filterList");
            later(() => ld.getElementById("filterLogButton").click());
            const vw = await winUrl("viewLog"); if (!vw) throw new Error("Filterprotokoll nicht offen");
            try {
              const lv = vw.document.getElementById("logView");
              await till(() => lv.currentURI?.spec?.endsWith("filterlog.html"), 6000); await pause(1200);
              out.log = look(lv);
              const snap = await lv.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(20, 20, 4, 4), 1, "rgb(255,0,255)");
              const cv = vw.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); cv.width = snap.width; cv.height = snap.height;
              const cx = cv.getContext("2d"); cx.drawImage(snap, 0, 0); out.pixel = [...cx.getImageData(1, 1, 1, 1).data];
            } finally { await shut(vw); }
          } finally { await shut(lw); }
          // direkt statt searchAllMessages: das tut ab TB 160 ohne Konto nichts (keine Lokalen Ordner mehr); Datei heißt ab 160 searchDialog.xhtml
          later(() => w.openSearchDialog(tm.currentAbout3Pane?.gFolder ?? null));
          const sw = await winUrl("earchDialog.xhtml"); if (!sw) throw new Error("Suchfenster nicht offen: " + [...Services.wm.getEnumerator(null)].map(x => x.location.href.split("/").pop() + " " + x.document.readyState));
          try { await pause(1000); const sd = sw.document;
            out.terms = look(sd.getElementById("searchTermList")); out.field = look([...sd.querySelectorAll("#searchTermList input:not([type=checkbox])")].find(vis));
            // ab TB 160 ist die Ergebnisliste eine tree-view wie die Mailliste, ohne treecols (noch nicht im halo-Stil geprüft)
            out.resHead = sd.querySelector("#threadTree > treecols") ? headOf(sd, "#threadTree") : null;
          } finally { await shut(sw); }
          later(() => w.openKeyManager());
          const kw = await winUrl("KeyManager"); if (!kw) throw new Error("OpenPGP-Schlüssel nicht offen");
          try { await pause(1000); out.keys = look(kw.document.getElementById("pgpKeyList")); out.keyHead = headOf(kw.document, "#pgpKeyList"); } finally { await shut(kw); }
          out.dark = dark; return out;""")
        hair = lambda r, rad: r["radius"] == rad and same_color(r["line"], r["paneLine"])
        px = res.get("pixel") or [255, 255, 255, 255]
        log_ok = (sum(px[:3]) < 200) if res["dark"] else (min(px[:3]) >= 250)
        ok = (res["list"]["app"] == "none" and hair(res["list"], "8px") and hair(res["search"], "7px") and res["search"]["img"] != "none"
              and hair(res["log"], "8px") and log_ok and hair(res["terms"], "8px") and hair(res["field"], "7px") and res["field"]["h"] <= 30
              and hair(res["keys"], "8px"))
        def head_ok(h):
            cols = h["cols"]
            return (len(cols) >= 2 and same_color(h["bb"], h["sep"]) and all(c["sh"] == "none" for c in cols)
                    and cols[0]["bl"] == "0px" and all(same_color(c["blc"], h["sep"]) for c in cols[1:])
                    and (p := h["pick"]) is not None and p["sh"] == "none" and p["bsh"] == "none" and p["bb"] == "0px"
                    and same_color(p["blc"], cols[1]["blc"]))
        ok = ok and all(head_ok(res[k]) for k in ("listHead", "resHead", "keyHead") if res[k] is not None)
        return ok, f"{res}"
    check("Filterliste, Filterprotokoll, Suche, OpenPGP: Listen und Felder mit Haarlinie und Radius statt hartem Rahmen, Protokoll dunkel ohne weiße Fläche; Spaltenköpfe samt Spaltenwahl-Knopf mit Haarlinien statt Systemlinie", filter_windows, results)

    def compact_icon():
        # „Ordner komprimieren?“: Fragezeichen in der Akzentfarbe statt schwarz (dunkel unsichtbar); nie „Compact now“
        res = m.js(COMPOSE_CHECK_JS + r"""
          const bag = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag2); bag.setPropertyAsAString("compactSize", "120 MB");
          w.openDialog("chrome://messenger/content/compactFoldersDialog.xhtml", "", "chrome,dialog,centerscreen", bag);
          const cw = await winUrl("compactFoldersDialog"); if (!cw) throw new Error("Dialog nicht offen");
          try { await pause(800); const cd = cw.document, img = cd.querySelector("#contentWrapper > img"), s = csOf(img), r = img.getBoundingClientRect();
            // gezeichnet prüfen: fill wirkt nur mit -moz-context-properties (berechnet nicht abfragbar)
            const cv = cd.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); cv.width = Math.ceil(r.width); cv.height = Math.ceil(r.height);
            const cx = cv.getContext("2d"); cx.drawWindow(cw, r.left, r.top, r.width, r.height, "rgb(128,128,128)");
            const acc = rgba(colorOf(cd, "AccentColor")), px = cx.getImageData(0, 0, cv.width, cv.height).data; let hits = 0;
            for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - acc[0]) + Math.abs(px[i + 1] - acc[1]) + Math.abs(px[i + 2] - acc[2]) < 40) hits++;
            return { fill: s.fill, accent: colorOf(cd, "AccentColor"), accentPixels: hits };
          } finally { await shut(cw); }""")
        ok = same_color(res["fill"], res["accent"]) and not same_color(res["fill"], "rgb(0, 0, 0)") and res["accentPixels"] >= 50
        return ok, f"{res}"
    check("„Ordner komprimieren?“: Fragezeichen in der Akzentfarbe statt schwarz", compact_icon, results)

    def downloads():
        # Gespeicherte Dateien (about:downloads) bekommt das Design: Kapsel-Knopf, Fläche in Fensterfarbe (dunkel nicht Navy)
        res = m.js(COMPOSE_CHECK_JS + r"""
          tm.switchToTab(0); await pause(300); await w.openSavedFilesWnd(); await pause(2000);
          const t = tm.tabInfo.find(x => x.browser?.currentURI?.spec == "about:downloads"); if (!t) throw new Error("Tab fehlt");
          try { const dd = t.browser.contentDocument; await till(() => dd.getElementById("clearDownloads") && dd.defaultView.__mcTheme, 5000); await pause(400);
            const b = csOf(dd.getElementById("clearDownloads")), l = csOf(dd.getElementById("msgDownloadsRichListBox"));
            return { theme: !!dd.defaultView.__mcTheme, radius: b.borderTopLeftRadius, bg: b.backgroundColor, control: colorOf(dd, "var(--mt-control)", "backgroundColor"),
                     body: csOf(dd.body).backgroundColor, window: colorOf(dd, "var(--mt-window)", "backgroundColor"), list: [l.borderTopLeftRadius, l.borderTopColor],
                     paneLine: colorOf(dd, "var(--mt-pane-line)") };
          } finally { tm.closeTab(t); await pause(300); }""")
        ok = (res["theme"] and res["radius"] == "999px" and same_color(res["bg"], res["control"]) and same_color(res["body"], res["window"])
              and not same_color(res["body"], "rgb(26, 32, 44)") and res["list"][0] == "8px" and same_color(res["list"][1], res["paneLine"]))
        return ok, f"{res}"
    check("Gespeicherte Dateien: Design auch in about:downloads – Kapsel-Knopf, Fensterfarbe, Liste mit Haarlinie", downloads, results)

    def import_export():
        # Import und Export (about:import): Fläche in Fensterfarbe wie die übrigen Tabs, dunkel nicht Firefox-Blauschwarz #18181B
        # (der leichte Schleier des body bleibt, damit sich hell die weiße Karte abhebt)
        res = m.js(COMPOSE_CHECK_JS + r"""
          tm.switchToTab(0); await pause(300); const out = {};
          for (const [k, open] of [["imp", () => w.toImport()], ["exp", () => w.toExport()]]) {
            open(); await pause(2000);
            const t = tm.tabInfo.find(x => x.browser?.currentURI?.spec?.startsWith("about:import")); if (!t) throw new Error("Tab fehlt");
            try { const dd = t.browser.contentDocument; await till(() => dd.getElementById("stepNav") && dd.defaultView.__mcTheme, 5000); await pause(400);
              out[k] = { theme: !!dd.defaultView.__mcTheme, root: csOf(dd.documentElement).backgroundColor, body: csOf(dd.body).backgroundColor,
                         color: csOf(dd.documentElement).color, hash: dd.location.hash,
                         window: colorOf(dd, "var(--mt-window)", "backgroundColor"), text: colorOf(dd, "var(--mt-text)") };
            } finally { tm.closeTab(t); await pause(300); }
          }
          return out;""")
        def ok1(r):
            return (r["theme"] and same_color(r["root"], r["window"]) and not same_color(r["root"], "rgb(24, 24, 27)")
                    and same_color(r["color"], r["text"]))
        return ok1(res["imp"]) and ok1(res["exp"]), f"{res}"
    check("Import und Export: Fläche in Fensterfarbe wie die übrigen Tabs, dunkel kein Blauschwarz", import_export, results)

    def print_preview():
        # Druckvorschau einer Mail: Knopf „Print/Save“ in der Systemakzentfarbe statt Proton-Blau bzw. -Türkis, Panel neutral; nie drucken
        res = m.js(DIALOG_READING_JS + r"""
          await showMail("Halo Jetzt");
          w.setTimeout(() => a3.commandController.doCommand("cmd_print"), 0);
          const all = () => { const out = []; const walk = bc => { out.push(bc); bc.children.forEach(walk); }; walk(w.browsingContext); return out; };
          const pd = await tillM(() => all().map(bc => { try { return bc.window?.document; } catch { return null; } })
            .find(x => x && x.documentURI == "chrome://global/content/print.html" && x.getElementById("print-button")), 12000);
          if (!pd) return { open: false };
          try { await nap(1500); const pw = pd.defaultView, s = pw.getComputedStyle(pd.getElementById("print-button"));
            return { open: true, btn: s.backgroundColor, text: s.color, accent: colorIn(pd, "AccentColor"), accentText: colorIn(pd, "AccentColorText"),
                     root: pw.getComputedStyle(pd.documentElement).backgroundColor,
                     sheet: colorIn(pd, "var(--mt-sheet)", "backgroundColor"), window: colorIn(pd, "var(--mt-window)", "backgroundColor") };
          } finally { try { pd.getElementById("cancel-button")?.click(); } catch {} await nap(800);
            try { if (!pd.defaultView.closed) pd.defaultView.close(); } catch {} await nap(400); }""")
        ok = (res.get("open") and same_color(res["btn"], res["accent"]) and same_color(res["text"], res["accentText"])
              and (same_color(res["root"], res["sheet"]) or same_color(res["root"], res["window"])) and not same_color(res["root"], "rgb(28, 27, 34)"))
        return ok, f"{res}"
    check("Druckvorschau: Hauptknopf in der Systemakzentfarbe statt Proton-Blau/-Türkis, Panel neutral", print_preview, results)

    def open_with():
        # Anhang ohne gespeicherte Aktion → „Öffnen von …“: Knöpfe flach wie in den übrigen Dialogen (Cancel grau, OK in Akzentfarbe)
        # statt nativem eckigem Knopf neben flachem; nie OK – sonst würde die Datei geschrieben/geöffnet
        res = m.js(DIALOG_READING_JS + r"""
          const doc = await showMail("Halo Anhänge"); const mw = doc.defaultView;
          const a = await tillM(() => mw.currentAttachments?.find(x => x.name == "Notizen.txt"), 4000); if (!a) return { open: false, why: "Anhang fehlt" };
          const mi = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).getFromTypeAndExtension(a.contentType, "txt");
          if (Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService).exists(mi) && !mi.alwaysAskBeforeHandling)
            return { open: false, why: "gespeicherte Aktion – der Dialog käme nicht" };
          w.setTimeout(() => a.open(mw.browsingContext), 0);
          const x = await winOf("unknownContentType"); if (!x) return { open: false, why: "Dialog nicht offen" };
          const dl = x.document.getElementById("unknownContentType");
          try { await nap(800); const sr = dl.shadowRoot, ok = sr.querySelector('[dlgtype="accept"]'), cancel = sr.querySelector('[dlgtype="cancel"]');
            const look = b => { const s = x.getComputedStyle(b); return [s.appearance, s.backgroundColor, s.borderTopLeftRadius, Math.round(b.getBoundingClientRect().height)]; };
            const out = { open: true, cancel: look(cancel), control: colorIn(x.document, "var(--mt-control)", "backgroundColor"), accent: colorIn(x.document, "AccentColor") };
            // OK ist anfangs gesperrt (Sicherheitsverzögerung) – zum Messen freigeben, nie anklicken
            // gesperrtes Aussehen am „Cancel“ messen – OK schaltet Thunderbirds Sicherheitsverzögerung selbst um
            // (unter Linux mitten in der Messung)
            cancel.disabled = true; await nap(150); out.disabled = x.getComputedStyle(cancel).opacity; cancel.disabled = false;
            ok.disabled = false; await nap(150); out.ok = look(ok);
            return out;
          } finally { try { dl.cancelDialog(); } catch {} await tillM(() => x.closed, 3000); if (!x.closed) x.close(); await nap(300); }""")
        if not res.get("open"):
            return False, f"{res}"
        c, o = res["cancel"], res["ok"]
        ok = (c[0] == "none" and o[0] == "none" and c[2] == "999px" and o[2] == "999px" and c[3] == o[3]
              and same_color(c[1], res["control"]) and same_color(o[1], res["accent"]) and float(res["disabled"]) < 1)
        return ok, f"{res}"
    check("„Öffnen von …“: Knöpfe als flache Kapseln wie in den Dialogen (Cancel grau, OK in Akzentfarbe) statt nativem Knopf", open_with, results)

    def rule_rows():
        # Bedingungszeilen (Suchordner-Dialog und Suchfenster): Auswahllisten nur in --mt-control ohne zweiten Verlauf (vorher doppelt
        # grau bzw. Fensterfarbe), gleich wie die Auswahl außerhalb der Liste; +/− mit Lücke statt aneinander; im Suchfenster der Teiler
        # als eine Haarlinie statt Doppellinie; Aktivitäten: „Clear List“ mit Luft zum Fensterrand, darüber eine Haarlinie
        res = m.js(COMPOSE_CHECK_JS + r"""
          const rows = dd => { const row = dd.querySelector("#searchTermList > richlistitem");
            const ml = [...row.querySelectorAll("menulist")].find(vis), btn = [...row.querySelectorAll(".small-button")].filter(vis);
            const other = [...dd.querySelectorAll("menulist")].find(x => vis(x) && !x.closest("richlistbox"));
            return { img: csOf(ml).backgroundImage, bg: csOf(ml).backgroundColor, other: other && csOf(other).backgroundColor,
                     control: colorOf(dd, "var(--mt-control)", "backgroundColor"),
                     gap: btn.length == 2 ? btn[1].getBoundingClientRect().left - btn[0].getBoundingClientRect().right : null }; };
          const f = await testFolder(); tm.switchToTab(0); await pause(500); const a3 = tm.currentAbout3Pane; a3.displayFolder(f.URI); await pause(800);
          const out = {};
          out.vf = await dialog(() => a3.commandController.doCommand("cmd_newVirtualFolder"), "virtualFolderProperties", async (dw, dd) => rows(dd));
          // direkt statt searchAllMessages: das tut ab TB 160 ohne Konto nichts (keine Lokalen Ordner mehr); Datei heißt ab 160 searchDialog.xhtml
          later(() => w.openSearchDialog(tm.currentAbout3Pane?.gFolder ?? null));
          const sw = await winUrl("earchDialog.xhtml"); if (!sw) throw new Error("Suchfenster nicht offen: " + [...Services.wm.getEnumerator(null)].map(x => x.location.href.split("/").pop() + " " + x.document.readyState));
          try { await pause(1000); const sd = sw.document, s = csOf(sd.getElementById("gray_horizontal_splitter"));
            out.search = rows(sd); out.split = { top: s.borderTopWidth, topColor: s.borderTopColor, bottom: s.borderBottomStyle, paneLine: colorOf(sd, "var(--mt-pane-line)") };
          } finally { await shut(sw); }
          later(() => w.openActivityMgr());
          const aw = await winUrl("activity.xhtml"); if (!aw) throw new Error("Aktivitäten nicht offen");
          try { await pause(800); const ad = aw.document, r = ad.getElementById("clearListButton").getBoundingClientRect(), v = csOf(ad.getElementById("activityView"));
            out.act = { left: r.left, bottom: aw.innerHeight - r.bottom, line: v.borderBottomColor, paneLine: colorOf(ad, "var(--mt-pane-line)") };
          } finally { await shut(aw); }
          return out;""")
        rows_ok = lambda r: (r["img"] == "none" and same_color(r["bg"], r["control"]) and r["other"] and same_color(r["bg"], r["other"])
                             and r["gap"] is not None and r["gap"] >= 3)
        sp, ac = res["split"], res["act"]
        ok = (rows_ok(res["vf"]) and rows_ok(res["search"]) and sp["bottom"] == "none" and float(sp["top"].rstrip("px")) <= 1
              and same_color(sp["topColor"], sp["paneLine"]) and ac["left"] >= 12 and ac["bottom"] >= 8 and same_color(ac["line"], ac["paneLine"]))
        return ok, f"{res}"
    check("Bedingungszeilen: Auswahllisten einfach grau wie die übrigen, +/− mit Lücke; Suche: Teiler eine Haarlinie; Aktivitäten: „Clear List“ mit Luft, Haarlinie", rule_rows, results)


FOLDER_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const csOf = (el, pseudo) => el.ownerDocument.defaultView.getComputedStyle(el, pseudo);
  // berechnete Farbe eines Werts (var(--mt-…)) im Dokument
  const colorOf = (doc, value, prop = "color") => { const e = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style[prop] = value;
    doc.documentElement.append(e); const c = csOf(e)[prop]; e.remove(); return c; };
  const rgba = c => { const v = (String(c).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = String(c).startsWith("color(") ? 255 : 1;
    return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  // ausgeblendet (display oder visibility) bzw. gar nicht vorhanden
  const gone = el => !el || csOf(el).display == "none" || csOf(el).visibility == "hidden";"""


def folder_checks(m, results):
    """Ordnerliste, Toolbar und Suche: neue Mails, Platz für den Bereiche-Knopf, Abschnitte ohne Linien, globale Suche
    (Suchfeld, Ergebnis-Tab, Vorschläge), Toolbar anpassen, „Anpassen…“ der Bereiche-Leiste."""

    def new_messages():
        res = m.js(FOLDER_JS + r"""
          const a3 = await toMail(); const ad = a3.document; const tree = ad.getElementById("folderTree");
          const li = await until(() => [...tree.querySelectorAll("li:not([data-server-type], [data-mode], .unselectable)")]
            .find(x => x.querySelector(":scope > .container > .name")?.getBoundingClientRect().width));
          if (!li) return { folder: null };
          li.classList.add("new-messages"); await wait(150);
          const name = li.querySelector(":scope > .container > .name"), star = li.querySelector(":scope > .container > .new-icon");
          const out = { folder: name.textContent, color: csOf(name).color, text: colorOf(ad, "var(--mt-text)"), weight: csOf(name).fontWeight,
                        star: star ? csOf(star).visibility : "fehlt" };
          li.classList.remove("new-messages");
          // Kontozeile bleibt grauer Abschnittstitel
          const srv = tree.querySelector("li[data-server-type] > .container > .name");
          if (srv) { const sl = srv.closest("li"); const had = sl.classList.contains("new-messages"); sl.classList.add("new-messages"); await wait(100);
            out.server = csOf(srv).color; out.tertiary = colorOf(ad, "var(--mt-text-tertiary)"); if (!had) sl.classList.remove("new-messages"); }
          return out;""")
        ok = (res.get("folder") is not None and same_color(res["color"], res["text"]) and res["weight"] == "400" and res["star"] == "hidden"
              and ("server" not in res or same_color(res["server"], res["tertiary"])))
        return ok, f"{res}"
    check("Ordnerliste: Ordner mit neuen Mails ohne Funkelstern, Name in Textfarbe wie die übrigen", new_messages, results)

    def drop_target():
        # Ziehen auf einen Ordner: Thunderbird setzt .drop-target – das Ziel muss sichtbar und von der Auswahl unterscheidbar sein
        res = m.js(FOLDER_JS + r"""
          const a3 = await toMail(); const ad = a3.document; const tree = ad.getElementById("folderTree");
          const li = await until(() => [...tree.querySelectorAll('li[role="treeitem"]:not([data-server-type], [data-mode], .unselectable, .selected)')]
            .find(x => x.querySelector(":scope > .container > .name")?.getBoundingClientRect().width));
          if (!li) return { folder: null };
          const c = li.querySelector(":scope > .container"), sel = tree.querySelector("li.selected > .container");
          const plain = csOf(c).backgroundColor;
          li.classList.add("drop-target"); await wait(150);
          const out = { folder: li.querySelector(".name").textContent, plain, bg: csOf(c).backgroundColor, ring: csOf(c).boxShadow,
                        selected: sel ? csOf(sel).backgroundColor : null, radius: parseFloat(csOf(c).borderTopLeftRadius) };
          li.classList.remove("drop-target");
          return out;""")
        ok = (res.get("folder") is not None and rgba_alpha(res["bg"]) >= 0.2 and not same_color(res["bg"], res["plain"])
              and (res["selected"] is None or not same_color(res["bg"], res["selected"])) and "inset" in res["ring"] and res["radius"] >= 6)
        return ok, f"{res}"
    check("Ordnerliste: Ziel beim Ziehen auf einen Ordner getönt mit Akzentrand, anders als die Auswahl", drop_target, results)

    def toggle_room():
        # Bereiche-Leiste aus: der Knopf unten links schwebt über der Ordnerliste – ganz nach unten gescrollt endet die
        # letzte Zeile darüber (auch ohne Statusleiste); Liste künstlich kurz, damit sie im leeren Testprofil scrollt
        res = m.js(FOLDER_JS + r"""
          const a3 = await toMail(); const ad = a3.document; const tree = ad.getElementById("folderTree");
          const wasHidden = w.gSpacesToolbar.isHidden;
          w.gSpacesToolbar.toggleToolbar(true); await wait(900);
          try {
            const btn = d.getElementById("mcSpacesToggle").getBoundingClientRect();
            const off = a3.browsingContext.embedderElement.getBoundingClientRect();
            const pane = ad.getElementById("folderPane").getBoundingClientRect();
            const pad = parseFloat(csOf(tree).paddingBottom);
            tree.style.maxHeight = "120px"; await wait(200);
            tree.scrollTop = tree.scrollHeight; await wait(200);
            const t = tree.getBoundingClientRect();
            const rows = [...tree.querySelectorAll("li > .container")].filter(c => c.getBoundingClientRect().height > 0);
            const last = rows.at(-1)?.getBoundingClientRect();
            return { pad, btnTop: Math.round(btn.top), btnW: Math.round(btn.width), btnLeft: Math.round(btn.left), paneBottom: Math.round(off.top + pane.bottom),
                     paneLeft: Math.round(off.left + pane.left), win: w.innerHeight, scrolls: tree.scrollHeight > tree.clientHeight,
                     lastGap: last ? Math.round(t.bottom - last.bottom) : null };
          } finally {
            tree.style.maxHeight = ""; tree.scrollTop = 0;
            if (!wasHidden) w.gSpacesToolbar.toggleToolbar(false);
            await wait(600);
          }""")
        # paneLeft: Fensterinhalt beginnt ganz links (früher rückte eine verirrte Statusleisten-Regel Fenster und
        # Seitenkörper je 12 px ein – weißer Streifen links, rechts abgeschnitten)
        ok = (res["btnW"] > 0 and res["btnLeft"] >= res["paneLeft"] and res["paneLeft"] <= 1 and res["pad"] >= 46
              and res["paneBottom"] - res["pad"] <= res["btnTop"] - 4 and res["win"] - res["pad"] <= res["btnTop"]
              and res["scrolls"] and res["lastGap"] is not None and res["lastGap"] >= res["pad"] - 1)
        return ok, f"{res}"
    check("Ordnerliste: letzte Zeile lässt sich über den Bereiche-Knopf hinaus scrollen (Leiste ausgeblendet)", toggle_room, results)

    def toggle_icon():
        # Symbol des Bereiche-Knopfs: Pfeil als Maske in Textfarbe (::before), darüber deckungsgleich sechs Rechtecke
        # in den Bereichsfarben (::after, eigene Fassung für dunkel); Pfeil nach links bzw. nach rechts bei ausgeblendet
        res = m.js(r"""const b = d.getElementById("mcSpacesToggle");
          const pe = (x) => w.getComputedStyle(b, x), r = b.getBoundingClientRect();
          const had = b.hasAttribute("data-mc-hidden");
          b.toggleAttribute("data-mc-hidden", false); const left = pe("::before").maskImage;
          b.toggleAttribute("data-mc-hidden", true); const right = pe("::before").maskImage;
          b.toggleAttribute("data-mc-hidden", had);
          const be = pe("::before"), af = pe("::after");
          return { w: Math.round(r.width), h: Math.round(r.height), bw: be.width, bh: be.height, bg: be.backgroundColor, color: w.getComputedStyle(b).color,
                   left, right, aw: af.width, ah: af.height, top: af.top, start: af.left, pos: af.position, img: af.backgroundImage,
                   dark: w.matchMedia("(prefers-color-scheme: dark)").matches };""")
        cols = (["45A0FD", "61C77A", "FCA53E", "FC5F98", "C07BE4", "A8A8AC"] if res["dark"]
                else ["186EC4", "33924A", "C47212", "C43166", "8C4BAD", "757579"])
        img = res["img"]
        pos = [img.find("%23" + c) for c in cols]
        ok = (res["w"] == 40 and res["h"] == 38 and res["bw"] == "22px" and res["bh"] == "22px" and res["bg"] == res["color"]
              and "M21 12H10M14.5 7 9.5 12l5 5" in res["left"] and "M9.5 12H20.5M16 7 21 12l-5 5" in res["right"]
              and "stroke-width=%221.7%22" in res["left"] and "M2.5 2.5v11" not in res["left"] + res["right"]
              and res["aw"] == "22px" and res["ah"] == "22px" and res["top"] == "8px" and res["start"] == "9px" and res["pos"] == "absolute"
              and all(x > 0 for x in pos) and pos == sorted(pos) and img.count("%3Crect") == 6)
        return ok, f"{ {k: v for k, v in res.items() if k not in ('left', 'right', 'img')} } Farben {pos}"
    check("Bereiche-Leiste: Knopf zum Ein-/Ausblenden mit Pfeil und sechs Rechtecken in den Bereichsfarben (hell/dunkel)", toggle_icon, results)

    def mode_lines():
        res = m.js(FOLDER_JS + r"""
          const a3 = await toMail(); const ad = a3.document; const fp = a3.folderPane; const old = fp.activeModes;
          fp.activeModes = ["smart", "all", "unread", "recent"]; await wait(1200);
          const out = [...ad.querySelectorAll("#folderTree > li[data-mode] > .mode-container")].filter(c => csOf(c).display != "none")
            .map(c => [c.parentNode.dataset.mode, csOf(c).borderTopStyle, csOf(c).borderTopWidth]);
          fp.activeModes = old; await wait(800);
          return out;""")
        ok = len(res) >= 3 and all(s == "none" or wd == "0px" for _, s, wd in res)
        return ok, f"{res}"
    check("Ordnerliste: Abschnitte (Favoriten, Ungelesen, Zuletzt) einheitlich ohne Linie darüber", mode_lines, results)

    # globale Suche im eigenen Tab: ein Tab für zwei Prüfungen
    gloda = {}

    def gloda_tab():
        if not gloda:
            gloda.update(m.js(FOLDER_JS + r"""
              const { GlodaMsgSearcher } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaMsgSearcher.sys.mjs");
              await toMail();
              const measure = () => { const p = d.getElementById("spacesPinnedButton").getBoundingClientRect();
                const s = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]')?.getBoundingClientRect();
                return { pinned: Math.round(p.right), search: s?.width ? Math.round(s.left) : null }; };
              const fits = () => { const x = measure(); return x.search !== null && x.search >= x.pinned + 11 && x; };
              const tab = tm.openTab("glodaFacet", { searcher: new GlodaMsgSearcher(null, "halo") });
              const out = {};
              try {
                await wait(1500);
                out.first = await until(fits, 4000) || measure();
                // nach einem Bereich mit anderer Kante (Kalender) wieder zum Such-Tab
                await toCalendar(); tm.switchToTab(tab); await wait(1200);
                out.again = await until(fits, 4000) || measure();
                const gd = await until(() => { const x = tab.browser?.contentDocument; return x?.readyState == "complete" && x.getElementById("gloda-facet-view") && x; }, 6000);
                if (gd) {
                  const view = gd.getElementById("gloda-facet-view"), empty = gd.querySelector("span.empty"), img = gd.querySelector("img.empty");
                  out.view = { bg: csOf(view).backgroundColor, window: colorOf(gd, "var(--mt-window)", "backgroundColor"),
                    side: csOf(gd.querySelector(".facets-sidebar")).backgroundColor, sidebar: colorOf(gd, "var(--mt-sidebar)", "backgroundColor"),
                    empty: csOf(empty).color, secondary: colorOf(gd, "var(--mt-text-secondary)"), img: csOf(img).width };
                  out.view.contrast = contrast(rgba(out.view.empty), rgba(out.view.bg));
                  // Treffer mit denselben Klassen wie glodaFacet.js nachgebaut (Gloda indiziert im Testprofil
                  // nicht verlässlich rechtzeitig); Thunderbirds Regeln hängen nur an den Klassen
                  const mk = (tag, cls, text) => { const e = gd.createElementNS("http://www.w3.org/1999/xhtml", tag); e.className = cls;
                    if (text) e.textContent = text; return e; };
                  const box = mk("div", "halo-test"), m1 = mk("div", "message"), m2 = mk("div", "message");
                  const subj = mk("span", "message-subject", "Betreff"), tag = mk("span", "message-tag", "To Do"),
                        body = mk("div", "message-body", "Auszug"), bar = mk("span", "bar-link", "Anna Beispiel");
                  m1.append(subj, tag, body); box.append(m1, m2, bar); gd.getElementById("main-column").append(box);
                  out.results = { font: csOf(view).fontFamily, msg: csOf(m1).fontFamily, bodyFont: csOf(body).fontFamily,
                    subj: [csOf(subj).color, csOf(subj).fontSize, csOf(subj).fontWeight], text: colorOf(gd, "var(--mt-text)"),
                    body: [csOf(body).color, csOf(body).fontSize], line: csOf(m1).borderBottomColor, sep: colorOf(gd, "var(--mt-separator)"),
                    person: csOf(bar).color, tag: [csOf(tag).borderTopStyle, csOf(tag).borderTopLeftRadius] };
                  box.remove();
                }
                const rs = tab.panel?.querySelector(".remote-gloda-search");
                out.field = rs && { border: csOf(rs).borderTopStyle, radius: parseFloat(csOf(rs).borderTopLeftRadius), height: Math.round(rs.getBoundingClientRect().height),
                                    bg: csOf(rs).backgroundColor, control: colorOf(d, "var(--mt-control)", "backgroundColor") };
              } finally { tm.closeTab(tab); await wait(600); await toMail(); }
              return out;"""))
        return gloda

    def gloda_search_field():
        g = gloda_tab()
        ok = all(g.get(k, {}).get("search") is not None and g[k]["search"] >= g[k]["pinned"] + 11 for k in ("first", "again"))
        return ok, f"Suchfeld links / Seitenleisten-Knopf rechts: zuerst {g.get('first')}, nach dem Kalender {g.get('again')}"
    check("Globale Suche: Suchfeld oben rechts vom Seitenleisten-Knopf, auch nach dem Wechsel aus dem Kalender", gloda_search_field, results)

    def gloda_page():
        g = gloda_tab()
        v, f = g.get("view") or {}, g.get("field") or {}
        ok = (bool(v) and same_color(v["bg"], v["window"]) and same_color(v["side"], v["sidebar"]) and same_color(v["empty"], v["secondary"])
              and v["contrast"] >= 4.5 and v["img"].endswith("px") and float(v["img"][:-2]) <= 64
              and bool(f) and f["border"] == "none" and f["radius"] >= 14 and f["height"] >= 26 and same_color(f["bg"], f["control"]))
        return ok, f"Seite {v}; Suchfeld {f}"
    check("Globale Suche: Ergebnis-Tab in den Flächen der übrigen Ansichten, Leerhinweis grau (Kontrast ≥ 4,5:1), Suchfeld als Kapsel", gloda_page, results)

    def gloda_results():
        g = gloda_tab()
        r, v = g.get("results") or {}, g.get("view") or {}
        ok = (bool(r) and r["msg"] == r["font"] and r["bodyFont"] == r["font"] and "monospace" not in r["bodyFont"]
              and same_color(r["subj"][0], r["text"]) and r["subj"][1] == "13px" and r["subj"][2] == "600"
              and same_color(r["body"][0], v.get("secondary")) and r["body"][1] == "12px"
              and same_color(r["line"], r["sep"]) and same_color(r["person"], r["text"])
              and r["tag"] == ["none", "4px"])
        return ok, f"{r}"
    check("Globale Suche: Treffer in Systemschrift statt Monospace, Betreff und Personen in Textfarbe statt Linkblau, Linien als Haarlinie",
          gloda_results, results)

    def menu_accel():
        # Tastenkürzel in Menüs (z. B. „Markieren“): neutral grau statt blaugrau, im markierten Eintrag in Auswahl-Schrift.
        # Eigenes kleines Menü im Hauptfenster (Einträge geschlossener Menüs haben keine berechneten Stile)
        res = m.js(FOLDER_JS + r"""
          await toMail();
          const p = d.createXULElement("menupopup"), mi = d.createXULElement("menuitem"), off = d.createXULElement("menuitem");
          mi.setAttribute("label", "Als ungelesen"); mi.setAttribute("acceltext", "M");
          off.setAttribute("label", "Als gelesen"); off.setAttribute("acceltext", "M"); off.setAttribute("disabled", "true");
          p.append(mi, off); (d.getElementById("mainPopupSet") || d.documentElement).append(p);
          p.openPopupAtScreen(w.screenX + 300, w.screenY + 200, false);
          const out = {};
          try {
            out.state = await until(() => p.state == "open" && p.state, 4000) || p.state;
            const acc = mi.querySelector(".menu-accel"), acc2 = off.querySelector(".menu-accel");
            if (!acc) return out;
            Object.assign(out, { color: csOf(acc).color, secondary: colorOf(d, "var(--mt-text-secondary)"),
                                 disabled: [csOf(acc2).color, csOf(off).color] });
            mi.setAttribute("_moz-menuactive", "true"); await wait(100);
            out.active = [csOf(acc).color, csOf(mi).color, colorOf(d, "var(--mt-accent-text)")];
          } finally { p.hidePopup(); await wait(300); p.remove(); }
          return out;""")
        ok = (bool(res.get("color")) and same_color(res["color"], res["secondary"]) and same_color(res["disabled"][0], res["disabled"][1])
              and same_color(res["active"][0], res["active"][1]) and same_color(res["active"][0], res["active"][2]))
        return ok, f"{res}"
    check("Menüs: Tastenkürzel neutral grau, im markierten Eintrag in der Schriftfarbe der Auswahl", menu_accel, results)

    def calendar_menu_accel():
        # Kontextmenüs der Kalenderansicht (Termin und freie Fläche) zeigen nur die Texte, keine Tastenkürzel –
        # andere Menüs behalten sie (Gegenprobe mit eigenem Menü)
        res = m.js(FOLDER_JS + r"""
          await toCalendar();
          const out = {};
          for (const id of ["calendar-item-context-menu", "calendar-view-context-menu"]) {
            const p = d.getElementById(id);
            p.openPopupAtScreen(w.screenX + 300, w.screenY + 200, false);
            try {
              out[id] = { state: await until(() => p.state == "open" && p.state, 4000) || p.state };
              const keyed = [...p.children].filter(x => x.localName == "menuitem" && x.hasAttribute("key") && !x.hidden);
              out[id].keyed = keyed.length;
              out[id].shown = keyed.filter(x => [...x.querySelectorAll(".menu-accel-container, .menu-accel")]
                .some(a => csOf(a).display != "none" && a.getBoundingClientRect().width > 0)).map(x => x.id);
              out[id].labels = keyed.filter(x => (x.querySelector(".menu-text, label")?.getBoundingClientRect().width || 0) > 0).length;
            } finally { p.hidePopup(); await wait(300); }
          }
          const p = d.createXULElement("menupopup"), mi = d.createXULElement("menuitem");
          mi.setAttribute("label", "Gegenprobe"); mi.setAttribute("acceltext", "M"); p.append(mi);
          (d.getElementById("mainPopupSet") || d.documentElement).append(p);
          p.openPopupAtScreen(w.screenX + 300, w.screenY + 200, false);
          try {
            await until(() => p.state == "open", 4000);
            const acc = mi.querySelector(".menu-accel");
            out.other = !!acc && csOf(acc).display != "none";
          } finally { p.hidePopup(); await wait(300); p.remove(); }
          return out;""")
        menus = [res.get(k) or {} for k in ("calendar-item-context-menu", "calendar-view-context-menu")]
        ok = all(x.get("state") == "open" and x.get("keyed", 0) >= 2 and not x.get("shown") and x.get("labels") == x.get("keyed")
                 for x in menus) and res.get("other") is True
        return ok, f"{res}"
    check("Kalender: Kontextmenüs von Termin und Ansicht ohne Tastenkürzel, andere Menüs mit", calendar_menu_accel, results)

    def folder_menu_icons():
        # Ordnermenü „Verschieben“ (Toolbar): Umriss-Symbole wie die Ordnerliste in Akzentfarbe, Papierkorb und Konto
        # mit eigenem Symbol; markiertes Konto in der Schrift der Auswahl, ohne dass sein Untermenü das erbt
        res = m.js(FOLDER_JS + r"""
          await toMail();
          const P = d.getElementById("toolbarMoveToPopup");
          const mask = v => { const e = d.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style.maskImage = v;
            d.documentElement.append(e); const r = csOf(e).maskImage; e.remove(); return r; };
          const icon = x => x.querySelector(":scope > .menu-icon");
          const info = x => { const s = csOf(icon(x)); return { label: x.getAttribute("label"), mask: s.maskImage, bg: s.backgroundColor, w: s.width }; };
          const out = { accent: colorOf(d, "var(--mt-accent)"), folder: mask("var(--mi-folder)"), serverMask: mask("var(--mi-server)"),
                        trashMask: mask("var(--mi-trash)") };
          P.openPopupAtScreen(w.screenX + 300, w.screenY + 200, false);
          try {
            out.state = await until(() => P.state == "open" && P.state, 4000) || P.state;
            const server = [...P.children].find(x => x.getAttribute("IsServer") == "true");
            const plain = [...P.children].find(x => x.classList.contains("folderMenuItem") && !x.hasAttribute("IsServer"));
            if (!server || !plain || !icon(server)) return { ...out, fehlt: [!!server, !!plain] };
            server.openMenu(true);
            out.sub_state = await until(() => server.menupopup?.state == "open" && "open", 4000) || server.menupopup?.state;
            const kids = [...server.menupopup.children].filter(x => x.classList.contains("folderMenuItem"));
            const trash = kids.find(x => x.getAttribute("SpecialFolder") == "Trash"), sub = kids.find(x => x.getAttribute("SpecialFolder") == "none");
            Object.assign(out, { plain: info(plain), trash: trash && info(trash), sub: sub && info(sub) });
            server.setAttribute("_moz-menuactive", "true"); await wait(100);
            out.server = info(server); out.server_color = csOf(server).color; out.trash_active = trash && csOf(icon(trash)).backgroundColor;
          } finally { P.hidePopup(); await wait(400); }
          // Ordner- und Mailansicht erlauben data:-Bilder (sonst fielen die Masken dort aus)
          const scope = ':has(> head > meta[http-equiv="Content-Security-Policy"][content*="data:"])';
          const a3 = tm.currentAbout3Pane;
          out.scope = [d, a3.document, a3.messageBrowser?.contentDocument].map(x => !!x && x.documentElement.matches(scope));
          return out;""")
        if not res or "fehlt" in res or "plain" not in res:
            return False, f"{res}"
        acc, trash, sub = res["accent"], res.get("trash") or {}, res.get("sub")
        flags = {
            "Ordner": res["plain"]["mask"] == res["folder"] and same_color(res["plain"]["bg"], acc) and res["plain"]["w"] == "16px",
            "Konto markiert": res["server"]["mask"] == res["serverMask"] and same_color(res["server"]["bg"], res["server_color"]),
            "Papierkorb": trash.get("mask") == res["trashMask"] and same_color(trash.get("bg"), acc) and same_color(res.get("trash_active"), acc),
            "Unterordner": not sub or (sub["mask"] == res["folder"] and same_color(sub["bg"], acc)),
            "CSP erlaubt data:": res["scope"] == [True, True, True]}
        detail = {k: v for k, v in res.items() if k not in ("folder", "serverMask", "trashMask")}
        for k in ("plain", "server", "trash", "sub"):
            if detail.get(k):
                detail[k] = {**detail[k], "mask": detail[k]["mask"][:40]}
        return all(flags.values()), f"{flags} {detail}"
    check("Ordnermenüs (Verschieben): Umriss-Symbole in Akzentfarbe wie die Ordnerliste statt Thunderbirds gefüllter Ordner",
          folder_menu_icons, results)

    def suggestions():
        res = m.js(FOLDER_JS + r"""
          const p = d.getElementById("PopupGlodaAutocomplete"); if (!p) return null; const s = csOf(p);
          return { font: s.fontSize, border: colorOf(d, s.getPropertyValue("--panel-border-color").trim() || "red"),
                   bg: colorOf(d, s.getPropertyValue("--panel-background-color").trim() || "red"), menu: colorOf(d, "var(--mt-menu-bg)"),
                   url: colorOf(d, s.getPropertyValue("--autocomplete-popup-url-color").trim() || "red"), secondary: colorOf(d, "var(--mt-text-secondary)") };""")
        ok = (res is not None and res["font"] == "13px" and rgba_alpha(res["border"]) == 0 and same_color(res["bg"], res["menu"])
              and same_color(res["url"], res["secondary"]))
        return ok, f"{res}"
    check("Suche: Vorschlagsliste wie die übrigen Menüs (13 px, ohne harten Rand, Adressen grau)", suggestions, results)

    def customize_toolbar():
        res = m.js(FOLDER_JS + r"""
          await toMail();
          d.querySelector("unified-toolbar").showCustomization();
          const out = { on: !!await until(() => d.documentElement.classList.contains("customizingUnifiedToolbar")) };
          try {
            await wait(800);
            const IDS = ["mcListHeader", "mcTodayToggle", "mcTodayTop", "mcTodayNew", "mcSpacesToggle"];
            const row = d.getElementById("unifiedToolbarContainer");
            out.shown = IDS.filter(id => !gone(d.getElementById(id)));
            out.hits = [[w.innerWidth - 50, 10], [30, w.innerHeight - 20], [400, 10]]
              .map(([x, y]) => d.elementFromPoint(x, y)?.closest?.('[id^="mc"]')?.id).filter(Boolean);
            out.row = [csOf(row).backgroundImage, csOf(row).backgroundColor, colorOf(d, "var(--mt-window)", "backgroundColor"), csOf(row, "::before").display];
          } finally {
            d.querySelector("unified-toolbar-customization").toggle(false);
            out.off = !!await until(() => !d.documentElement.classList.contains("customizingUnifiedToolbar"));
            await wait(600);
          }
          out.back = ["mcListHeader", "mcSpacesToggle"].filter(id => gone(d.getElementById(id)));
          return out;""")
        r = res.get("row") or ["?", "", "", ""]
        ok = (res["on"] and res["off"] and not res["shown"] and not res["hits"] and r[0] == "none" and same_color(r[1], r[2])
              and r[3] == "none" and not res["back"])
        return ok, f"{res}"
    check("Toolbar anpassen: Listenkopf, Today- und Bereiche-Knopf ausgeblendet, Zeile einfarbig; danach wieder da", customize_toolbar, results)

    def spaces_customize():
        res = m.js(FOLDER_JS + r"""
          await toMail();
          const item = id => d.getElementById(id);
          const sep = item("settingsContextOpenCustomizeItem")?.previousElementSibling;
          const out = { hidden: ["spacesToolbarContextCustomize", "settingsContextOpenCustomizeItem"].map(id => item(id)?.hidden ?? "fehlt"),
                        sep: sep?.localName == "menuseparator" ? sep.hidden : "fehlt" };
          const pop = async (menu, target) => { const r = target.getBoundingClientRect();
            target.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
              screenX: w.screenX + r.left + r.width / 2, screenY: w.screenY + r.top + r.height / 2 }));
            await wait(700); const state = menu.state;
            const visible = [...menu.children].filter(c => !c.hidden && c.localName == "menuitem").length;
            if (state != "closed") { menu.hidePopup(); await wait(400); } return { state, visible }; };
          // Rechtsklick auf die leere Leiste: kein (leeres) Menü
          out.bar = await pop(item("spacesToolbarContextMenu"), item("spacesToolbar"));
          out.customizing = w.gSpacesToolbar.isCustomizing;
          // Gegenprobe: das Menü am Einstellungen-Knopf geht weiter auf (Einstellungen, Konten, Add-ons)
          out.settings = await pop(item("settingsContextMenu"), item("settingsButton"));
          const before = w.gSpacesToolbar.isHidden;
          w.gSpacesToolbar.toggleToolbar(!before); await wait(300); out.toggled = w.gSpacesToolbar.isHidden != before;
          w.gSpacesToolbar.toggleToolbar(before); await wait(500); out.restored = w.gSpacesToolbar.isHidden == before;
          return out;""")
        ok = (res["hidden"] == [True, True] and res["sep"] is True and res["bar"]["state"] == "closed" and res["customizing"] is False
              and res["settings"]["state"] in ("open", "showing") and res["settings"]["visible"] == 3 and res["toggled"] and res["restored"])
        return ok, f"{res}"
    check("Bereiche-Leiste: „Anpassen…“ (öffnete nicht, sperrte das Ausblenden) entfernt, leere Leiste ohne leeres Menü", spaces_customize, results)


# Kontextmenü der Mailliste per Rechtsklick auf die ausgewählte Testmail (nach MESSAGE_JS) öffnen;
# dazu Farbhilfen (rgb()/color(srgb …) auf 0–255) und Kontrast nach WCAG
MENU_JS = MESSAGE_JS + r"""
  const ad = a3.document, P = ad.getElementById("mailContext");
  const cs = (el, pseudo) => a3.getComputedStyle(el, pseudo);
  const rgba = c => { const v = (String(c).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = String(c).startsWith("color(") ? 255 : 1;
    return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
  const over = (fg, bg) => fg.slice(0, 3).map((x, i) => x * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
  const colorOf = value => { const e = ad.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style.color = value;
    ad.documentElement.append(e); const c = cs(e).color; e.remove(); return c; };
  const openContext = async () => {
    const row = ad.querySelector('#threadTree tr.selected, #threadTree tr[aria-selected="true"]');
    if (!row) return "keine Zeile";
    const r = row.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 40), y = r.top + r.height / 2;
    for (const [type, buttons] of [["mousedown", 2], ["contextmenu", 2], ["mouseup", 0]])
      row.dispatchEvent(new a3.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: a3, button: 2, buttons,
        clientX: x, clientY: y, screenX: a3.mozInnerScreenX + x, screenY: a3.mozInnerScreenY + y }));
    return await until(() => P.state == "open" && "open", 4000) || P.state;
  };"""


def menu_checks(m, results):
    """Menüs: gleichmäßige Zeilen im Kontextmenü der Mailliste, lesbare Schlagwörter im Schlagwort-Menü."""

    def nav_rows():
        # Archivieren/Spam/Löschen baut halo.spaces aus Thunderbirds Symbolzeile zu Textzeilen um – sie waren 2 px niedriger
        res = m.js(MENU_JS + r"""
          const item = id => ad.getElementById(id);
          const NAV = ["navContext-archive", "navContext-markAsJunk", "navContext-delete"], REST = ["mailContext-editAsNew", "mailContext-moveMenu", "mailContext-tags", "mailContext-saveAs"];
          const out = { list: !!item("mailContext-navigation")?.classList.contains("mc-nav-list") };
          out.state = await openContext();
          try {
            // berechnete Abstände gibt es erst bei offenem Menü
            out.pad = Object.fromEntries([...NAV, ...REST].map(id => [id, item(id) ? cs(item(id)).paddingTop : "fehlt"]));
            const h = id => { const e = item(id); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height * 10) / 10 : null; };
            out.nav = NAV.map(h).filter(x => x); out.rest = REST.map(h).filter(x => x);
          } finally { P.hidePopup(); await wait(400); }
          return out;""")
        pads = set((res.get("pad") or {"-": ""}).values())
        hs = res.get("nav", []) + res.get("rest", [])
        # Fenster verdeckt (Höhe 0): nur das Padding werten
        heights_ok = (not any(hs)) or (len(res["nav"]) >= 2 and len(res["rest"]) >= 3 and max(hs) - min(hs) < 0.5)
        ok = res["list"] and len(pads) == 1 and pads.pop().endswith("px") and heights_ok
        return ok, f"{res}"
    check("Kontextmenü Mailliste: Archivieren/Spam/Löschen so hoch wie die übrigen Zeilen", nav_rows, results)

    def tag_menu():
        # Schlagwort-Menü: Thunderbird färbt die Namen in der Grundfarbe (Orange auf Hellgrau 1,6:1) – gemischt mit der Textfarbe lesbar
        res = m.js(MENU_JS + r"""
          const sub = ad.getElementById("mailContext-tagpopup"), menu = ad.getElementById("mailContext-tags");
          const text = colorOf("var(--mt-text)"), menuBg = rgba(colorOf("var(--mt-menu-bg)"));
          const dark = lum(rgba(text)) > 0.5;
          // gemessener Menügrund (durchscheinend) und die Menüfläche über Weiß bzw. Schwarz
          const bgs = dark ? [[36, 36, 38, 1], over(menuBg, [0, 0, 0])] : [[224, 224, 224, 1], over(menuBg, [255, 255, 255])];
          const out = { dark, state: await openContext(), tags: [] };
          try {
            menu.open = true;
            out.sub = await until(() => sub.state == "open" && "open", 4000) || sub.state;
            const tags = [...sub.querySelectorAll(':scope > menuitem[type="checkbox"]')].filter(x => x.style.color);
            for (const t of tags) {
              const tx = cs(t.querySelector(".menu-text")).color, icon = t.querySelector(".menu-icon");
              out.tags.push({ name: t.getAttribute("label"), inline: t.style.color, text: tx, icon: icon ? cs(icon).color : null,
                              contrast: Math.min(...bgs.map(b => contrast(rgba(tx), b))) });
            }
            if (tags[1]) { tags[1].setAttribute("_moz-menuactive", "true"); await wait(100);
              out.active = [cs(tags[1].querySelector(".menu-text")).color, colorOf("var(--mt-accent-text)")];
              tags[1].removeAttribute("_moz-menuactive"); }
          } finally { sub.hidePopup?.(); P.hidePopup(); await wait(400); }
          return out;""")
        tags = res.get("tags", [])
        ok = (len(tags) >= 5 and all(not same_color(t["text"], t["inline"]) and same_color(t["icon"], t["text"]) and t["contrast"] >= 4.5 for t in tags)
              and same_color(*res.get("active", ["", "?"])))
        return ok, f"{res}"
    check("Schlagwort-Menü: Namen in Schlagwortfarbe lesbar (Kontrast ≥ 4,5:1), markiert in der Schrift der Auswahl", tag_menu, results)


# Kalender: Woche mit heute (auf 8 Uhr gescrollt), Spalten, Popups öffnen/schließen, Inhaltsteil eines Panels
CAL_CHECK_JS = COMPOSE_CHECK_JS + r"""
  const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
  const toWeek = async (width = 1500) => { w.resizeTo(width, 900); await pause(900); await toCalendar(); w.switchToView("week");
    w.currentView().goToDay(cal.dtz.now()); await pause(1200); w.currentView().scrollToMinute(480); await pause(700); return w.currentView(); };
  const cols = () => [...d.querySelectorAll("#week-view .day-column-container")]
    .map(c => ({ h: c.querySelector(".day-column-heading"), hc: c.querySelector("calendar-header-container") })).filter(x => vis(x.h));
  const isOpen = p => till(() => p?.state == "open", 4000);
  const shutPop = async p => { if (p && p.state != "closed") { p.hidePopup(); await till(() => p.state == "closed", 2000); } };
  const partOf = p => p?.shadowRoot?.querySelector('[part~="content"]');
  const today = () => { const t = cal.dtz.now(); t.isDate = true; return t; };"""


def calendar_checks(m, results):
    """Kalender: Tagesköpfe der Woche (Höhe, schmales Fenster), Ganztags-Termine, Rasterlinien, Schnellfenster samt
    Datumsauswahl und Auswahlliste, Pfeil des „+“-Popovers, Termin-Dialog (Schrift, Minimonat, Uhrzeit-Raster), Drucken."""

    def week_heads():
        # Thunderbird versetzt die deckende Ganztags-Zeile um Text + Innenabstand + Rand des Kopfs (ohne min-height) –
        # mit min-height lag sie über den Unterlängen („Mondav“)
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek();
          return cols().map(({ h, hc }) => { const a = h.getBoundingClientRect(), b = hc.getBoundingClientRect();
            const el = d.elementFromPoint(a.left + a.width / 2, a.bottom - 2);
            const sp = [...h.children].find(s => !s.hidden && s.getBoundingClientRect().width > 0);
            return { height: Math.round(a.height * 10) / 10, gap: Math.round((b.top - a.bottom) * 10) / 10, hit: !!el && h.contains(el),
                     text: sp?.textContent, cut: !sp || sp.scrollWidth > sp.clientWidth + 0.5 }; });""")
        # breites Fenster: Thunderbird wählt Lang- oder Kurzform so, dass sie passt – kein Kopf mit „…“ (früher „Wednesday Oct…“)
        ok = len(res) == 7 and all(c["gap"] >= -0.6 and c["hit"] and c["height"] >= 28 and not c["cut"] for c in res)
        return ok, f"{res}"
    check("Woche: Tagesköpfe ganz sichtbar (Ganztags-Zeile beginnt darunter, Unterlängen nicht abgeschnitten, passende Lang- oder Kurzform ohne „…“)", week_heads, results)

    def event_stripe():
        # Termine in Woche und Tag: frei stehender, runder Farbstrich wie in der Monatsansicht (früher ein Innenschatten,
        # der der Ecke folgte und wie eine Klammer „[“ aussah); ausgewählt weiß
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Strichtermin"; e.calendar = c;
          const s = cal.dtz.now(); s.hour = 10; s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          const saved = await c.addItem(e);
          const out = {};
          try {
            const stripe = el => { const a = w.getComputedStyle(el), b = w.getComputedStyle(el, "::before"), r = el.getBoundingClientRect();
              return { shadow: a.boxShadow, content: b.content, w: b.width, radius: b.borderTopLeftRadius, bg: b.backgroundColor,
                       h: Math.round(parseFloat(b.height)), boxH: Math.round(r.height) }; };
            const find = sel => till(() => [...d.querySelectorAll(sel)].find(b => vis(b) && /Halo Strichtermin/.test(b.textContent)), 4000);
            await toWeek();
            const wb = await find("#week-view calendar-event-box"); out.week = wb && stripe(wb);
            w.currentView().selectedItem = null;
            if (wb) { w.currentView().setSelectedItems([saved]); await pause(300); out.weekSel = stripe(wb).bg; w.currentView().setSelectedItems([]); }
            w.switchToView("day"); w.currentView().goToDay(cal.dtz.now()); await pause(1200);
            const db = await find("#day-view calendar-event-box"); out.day = db && stripe(db);
            w.switchToView("month"); await pause(1200);
            const mb = await find("calendar-month-day-box-item"); out.month = mb && stripe(mb);
          } finally {
            try { await c.deleteItem(saved); } catch {}
            w.switchToView("week"); await pause(400);
          }
          return out;""")
        def good(x):
            return (bool(x) and x["shadow"] == "none" and x["content"] != "none" and x["w"] == res["month"]["w"]
                    and x["radius"] == res["month"]["radius"] and x["h"] >= x["boxH"] - 8)
        ok = bool(res.get("month")) and good(res.get("week")) and good(res.get("day")) and res.get("weekSel", "").startswith("rgba(255, 255, 255")
        return ok, f"{res}"
    check("Woche/Tag: Termine mit frei stehendem, rundem Farbstrich wie in der Monatsansicht (keine Klammer), ausgewählt weiß", event_stripe, results)

    def narrow_heads():
        # schmales Fenster: Kopf nicht breiter als seine Spalte (Thunderbirds Inline-Mindestbreite), Text endet mit „…“
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek(1136);
          const heads = cols().map(({ h }) => { const spans = [...h.children].filter(s => !s.hidden && s.getBoundingClientRect().width > 0);
            const a = h.getBoundingClientRect(), r = spans[0]?.getBoundingClientRect();
            return { shown: spans.length, ellipsis: spans[0] ? csOf(spans[0]).textOverflow : null,
                     inside: !!r && r.right <= a.right + 0.5 && r.left >= a.left - 0.5, l: Math.round(a.left * 10) / 10, r: Math.round(a.right * 10) / 10 }; });
          const out = { width: w.outerWidth, heads };
          w.resizeTo(1500, 900); await pause(900); return out;""")
        h = res["heads"]
        ok = (len(h) == 7 and all(x["shown"] == 1 and x["ellipsis"] == "ellipsis" and x["inside"] for x in h)
              and all(h[i]["r"] <= h[i + 1]["l"] + 0.5 for i in range(len(h) - 1)))
        return ok, f"{res}"
    check("Woche im schmalen Fenster: Tagesköpfe in ihrer Spalte, gekürzt mit „…“, ohne Überlappung", narrow_heads, results)

    def allday_single_line():
        # ganztägige Termine in Woche/Tag einzeilig (Thunderbird bricht dort um – die Zeile wurde doppelt so hoch)
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Ganztags Konferenz mit sehr langem Titel in Wien"; e.calendar = c;
          const s = today(); const en = s.clone(); en.day += 2; e.startDate = s; e.endDate = en;
          const saved = await c.addItem(e);
          try {
            await toWeek();
            const labels = await till(() => { const l = [...d.querySelectorAll("#week-view .allday-events-list .event-name-label")]
              .filter(x => /Halo Ganztags Konferenz/.test(x.textContent) && vis(x)); return l.length && l; }, 6000) || [];
            await pause(300);
            return labels.map(l => ({ ws: csOf(l).whiteSpace, li: Math.round(l.closest("li").getBoundingClientRect().height * 10) / 10 }));
          } finally { try { await c.deleteItem(saved); } catch {} }""")
        ok = len(res) >= 1 and all(x["ws"] == "nowrap" and x["li"] <= 26 for x in res)
        return ok, f"{res}"
    check("Woche: ganztägige Termine einzeilig (höchstens 26 px hoch)", allday_single_line, results)

    def grid_lines():
        # keine 2-px-Linie der Zeitleiste und unter den Ganztags-Zeilen, keine doppelte Linie rechts der ausgewählten Spalte
        res = m.js(CAL_CHECK_JS + r"""
          const v = await toWeek(); v.selectedDay = today(); await pause(500);
          const sel = d.querySelector("#week-view .day-column-selected");
          const tb = d.querySelector("#week-view .multiday-timebar"), hc = d.querySelector("#week-view calendar-header-container");
          const hb = sel?.querySelector(".multiday-hour-box"), shc = sel?.querySelector("calendar-header-container");
          return { selected: !!sel, timebar: csOf(tb).borderRightWidth, header: parseFloat(csOf(hc).borderBottomWidth),
                   hourBox: hb ? csOf(hb).borderRightWidth : null, selHeader: shc ? csOf(shc).borderRightWidth : null };""")
        ok = res["selected"] and res["timebar"] == "0px" and res["header"] <= 1 and res["hourBox"] == "0px" and res["selHeader"] == "0px"
        return ok, f"{res}"
    check("Woche: Rasterlinien als Haarlinie (Zeitleiste, Ganztags-Zeile, ausgewählte Spalte ohne doppelte Linie)", grid_lines, results)

    def quick_panel_surfaces():
        # Schnellfenster in der deckenden Popover-Fläche ohne Rand (dunkel sonst navyblau); Datumsauswahl als ein
        # Popover ohne harte Ränder, Auswahl in Akzentfarbe; Auswahlliste ohne Kachel-Flächen je Zeile
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(vis);
          li.querySelector("button").click();
          const qp = await till(() => { const q = d.getElementById("mcQuickPanel"); return q?.state == "open" && q; }, 4000);
          if (!qp) return { open: false, visibility: d.visibilityState };
          await pause(300);
          const out = { open: true, dark, token: colorOf(d, "var(--mt-popover-bg)", "backgroundColor") };
          try {
            const pc = csOf(partOf(qp)); out.panel = { bg: pc.backgroundColor, border: pc.borderTopColor, bw: pc.borderTopWidth };
            const f = qp.__mc; if (!vis(f.startDate)) { f.summary.click(); await pause(600); }
            const dp = d.getElementById("DateTimePickerPanel");
            d.notifyUserGestureActivation(); f.startDate.showPicker();
            if (await isOpen(dp)) {
              const fd = await till(() => dp.querySelector("iframe")?.contentDocument?.querySelector("button.month-year") && dp.querySelector("iframe").contentDocument, 4000);
              await pause(400);
              const pp = csOf(partOf(dp)), sel = fd?.querySelector(".days-view td.selection");
              out.picker = { bg: pp.backgroundColor, border: pp.borderTopColor, bw: pp.borderTopWidth, body: fd && csOf(fd.body).backgroundColor,
                month: fd && csOf(fd.querySelector("button.month-year")).borderTopColor, clear: fd && csOf(fd.getElementById("clear-button")).borderTopColor,
                sel: sel && csOf(sel).backgroundColor, accent: fd && colorOf(fd, "AccentColor", "backgroundColor") };
              await shutPop(dp);
            }
            d.notifyUserGestureActivation(); try { f.repeat.showPicker(); } catch {}
            const sd = await till(() => d.getElementById("ContentSelectDropdown")?.menupopup, 4000);
            // Diagnose, falls die Auswahlliste nicht messbar aufgeht
            out.selectInfo = { os: Services.appinfo.OS, dropdown: !!sd, repeatVisible: vis(f.repeat) };
            if (sd && await isOpen(sd)) {
              await pause(300);
              out.select = [...sd.children].filter(x => x.localName == "menuitem" && x.getAttribute("_moz-menuactive") != "true" && vis(x)).map(x => csOf(x).backgroundColor);
              await shutPop(sd);
            } else {
              // unter macOS bleibt die Liste nach showPicker() zu – dann ein echter Mausklick (unten), Schnellfenster bleibt offen
              out.selectInfo.state = sd?.state ?? null;
              const r = f.repeat.getBoundingClientRect(); out.click = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
            }
          } finally { if (!out.click) await shutPop(qp); }
          return out;""")
        if res.get("click"):
            x, y = res["click"]
            m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}])
            res["select"] = m.js(CAL_CHECK_JS + r"""
              const qp = d.getElementById("mcQuickPanel"), sd = d.getElementById("ContentSelectDropdown")?.menupopup;
              try {
                if (!sd || !await isOpen(sd)) return null;
                await pause(300);
                const c = [...sd.children].filter(x => x.localName == "menuitem" && x.getAttribute("_moz-menuactive") != "true" && vis(x)).map(x => csOf(x).backgroundColor);
                await shutPop(sd); return c;
              } finally { await shutPop(qp); }""")
        if not res.get("open"):
            return res.get("visibility") == "hidden", f"Schnellfenster nicht offen {res}"
        p, k = res["panel"], res.get("picker") or {}
        no_border = lambda c, wd: wd == "0px" or rgba_alpha(c) == 0
        ok = (no_border(p["border"], p["bw"]) and same_color(p["bg"], res["token"])
              and same_color(res["token"], "rgb(44, 44, 46)" if res["dark"] else "rgb(251, 251, 252)")
              and bool(k) and no_border(k["border"], k["bw"]) and same_color(k["bg"], k["body"])
              and rgba_alpha(k["month"]) == 0 and rgba_alpha(k["clear"]) == 0 and (k["sel"] is None or same_color(k["sel"], k["accent"]))
              and bool(res.get("select")) and all(rgba_alpha(c) == 0 for c in res["select"]))
        return ok, f"{res}"
    check("Schnellfenster: deckende Fläche ohne Rand; Datumsauswahl ein Popover ohne harte Ränder; Auswahlliste ohne Kacheln", quick_panel_surfaces, results)

    def new_popup_arrow():
        # „+“ der Today-Pane: Pfeil des Popovers über der Mitte des Knopfs (früher 240 px daneben) – auch am Bildschirmrand
        res = m.js(CAL_CHECK_JS + r"""
          const sx = w.screenX, sy = w.screenY, sw = w.outerWidth, sh = w.outerHeight; const out = { visibility: d.visibilityState };
          await toMail();
          const measure = async () => { await pause(800);
            if (!w.TodayPane.isVisible) { d.getElementById("mcTodayToggle").click(); await pause(900); }
            const np = d.getElementById("mcNewPopup"), btn = d.getElementById("mcTodayNew");
            btn.click(); if (!await isOpen(np)) return { open: false };
            await pause(400);
            // in Bildschirmkoordinaten (unter Windows hat der Popover-Inhalt eigene Koordinaten)
            const box = np.querySelector(".mc-pop"), p = np.getBoundingClientRect(), o = np.getOuterScreenRect(), c = box.getBoundingClientRect(), a0 = btn.getBoundingClientRect();
            const b = { left: o.left + (c.left - p.left), right: o.left + (c.left - p.left) + c.width };
            const a = { left: w.mozInnerScreenX + a0.left, right: w.mozInnerScreenX + a0.right, width: a0.width };
            const arrow = b.left + parseFloat(csOf(box, "::before").left) + 7, mid = a.left + a.width / 2;
            const r = { open: true, diff: Math.round(arrow - mid), inL: Math.round(arrow - b.left), inR: Math.round(b.right - arrow), bg: csOf(box).backgroundColor,
                        overButton: arrow >= a.left + 4 && arrow <= a.right - 4,
                        // Diagnose in Bildschirmkoordinaten: Bildschirm, Fenster, Popover und Knopf
                        screen: [w.screen.availLeft, w.screen.availWidth], win: [w.screenX, w.outerWidth],
                        panel: (o => [Math.round(o.left), Math.round(o.width)])(np.getOuterScreenRect()), btnX: Math.round(a.left) };
            await shutPop(np); return r; };
          // höchstens so breit wie der Bildschirm (Windows-VM: 1024 px) – sonst läge das „+“ außerhalb
          w.moveTo(w.screen.availLeft, w.screen.availTop); w.resizeTo(Math.min(1500, w.screen.availWidth), 900); out.left = await measure();
          // rechter Fensterrand am Bildschirmrand (wie maximiert): Gecko schiebt das Popover nach links
          w.resizeTo(Math.min(1300, w.screen.availWidth), 900); await pause(800); w.moveTo(w.screen.availLeft + w.screen.availWidth - w.outerWidth, w.screen.availTop);
          // das „+“ selbst 26 px vor dem Bildschirmrand wie im maximierten Fenster unter macOS (unter Linux/Windows
          // liegt es wegen Menü und Fensterknöpfen weiter innen, Gecko klappte das Popover dort nie um)
          await pause(800); const nb = d.getElementById("mcTodayNew");
          if (!w.TodayPane.isVisible) { d.getElementById("mcTodayToggle").click(); await pause(900); }
          const shift = w.screen.availLeft + w.screen.availWidth - 26 - (w.mozInnerScreenX + nb.getBoundingClientRect().right);
          if (Math.abs(shift) > 2) { w.moveTo(w.screenX + Math.round(shift), w.screen.availTop); await pause(800); }
          out.edge = await measure();
          w.moveTo(sx, sy); w.resizeTo(sw, sh); await pause(800);
          out.token = colorOf(d, "var(--mt-popover-bg)", "backgroundColor");
          return out;""")
        shots = [res["left"], res["edge"]]
        if any(not s["open"] for s in shots) and res["visibility"] == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        # am Bildschirmrand bleibt der Pfeil vor der runden Ecke – dann zumindest über dem Knopf
        ok = all(s["open"] and s["inL"] >= 20 and s["inR"] >= 20 and same_color(s["bg"], res["token"]) for s in shots) \
            and abs(res["left"]["diff"]) <= 3 and (abs(res["edge"]["diff"]) <= 3 or res["edge"]["overButton"])
        return ok, f"{res}"
    check("Today-Pane: Pfeil des „+“-Popovers über der Mitte des Knopfs (auch am Bildschirmrand)", new_popup_arrow, results)

    def event_dialog():
        # Termin-Dialog: Schrift 13 px (Beschriftungen, Felder, Beschreibung in der Systemschrift), Abstand Beschriftung–Feld;
        # Minimonat im Datumsfeld ohne Heute-Kästchen und fette Lavendel-Wochen; Uhrzeit-Raster ohne Gitter, 13 px, Akzent
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Dialogtermin"; e.calendar = c;
          // feste Tageszeit: abends läge das Ende sonst nach Mitternacht und die Dauer (nur über die Uhrzeit) würde negativ
          const s = cal.dtz.now(); s.hour = 10; s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          e.setProperty("DESCRIPTION", "Erfundene Beschreibung zum Test."); const saved = await c.addItem(e);
          const out = {};
          let dw = null;
          try {
            await toCalendar(); w.modifyEventWithDialog(saved, true);
            dw = await winUrl("calendar-event-dialog"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById("event-grid") && f; }, 8000);
            const id = iw.document, ed = id.getElementById("item-description");
            const body = await till(() => { const b = ed.contentDocument?.body; return b && /Erfundene/.test(b.textContent) && b; }, 6000);
            await pause(1800);
            // Zeilen mit Beschriftung (XUL-label mit value) und sichtbarem Feld
            const rows = [...id.querySelectorAll("#event-grid > tr")].filter(tr => vis(tr.querySelector(":scope > th label")) && vis(tr.querySelector(":scope > td")?.firstElementChild));
            out.rows = rows.map(tr => { const lab = tr.querySelector(":scope > th label"), fld = tr.querySelector(":scope > td").firstElementChild;
              return { text: lab.getAttribute("value") || lab.textContent.trim(), font: csOf(lab).fontSize, gap: Math.round(fld.getBoundingClientRect().left - lab.getBoundingClientRect().right) }; });
            out.title = csOf(id.getElementById("item-title")).fontSize;
            out.desc = body ? { font: csOf(body).fontSize, family: csOf(body).fontFamily } : null;
            const grid = id.getElementById("event-grid");
            out.overflow = { grid: [grid.scrollWidth, grid.clientWidth], doc: [id.documentElement.scrollWidth, id.documentElement.clientWidth] };
            // Datumsfeld: Minimonat
            const dml = id.querySelector("#event-starttime datepicker menulist");
            dml.open = true;
            if (await isOpen(dml.menupopup)) {
              await pause(500);
              const mm = dml.menupopup.querySelector("calendar-minimonth"), td = mm.querySelector("td.minimonth-day[today]"), wk = [...mm.querySelectorAll(".minimonth-week")].find(vis);
              out.mini = { bg: csOf(mm).backgroundColor, today: td ? csOf(td).borderTopColor : null, week: wk ? [csOf(wk).fontWeight, csOf(wk).color] : null };
              await shutPop(dml.menupopup);
            }
            // Uhrzeit wie Apple Kalender: Klick öffnet nur ein Uhrzeit-Popover – kein Stundenraster, keine Datumsauswahl;
            // die Datumsauswahl hat keine Uhrzeitzeile (unter Linux/xvfb schließt sich ein Popup evtl. gleich wieder)
            const tp = id.querySelector("#event-starttime timepicker"), tml = tp.querySelector("menulist"), endTp = id.querySelector("#event-endtime timepicker");
            const durBefore = (endTp.value[0] * 60 + endTp.value[1]) - (tp.value[0] * 60 + tp.value[1]);
            const panels = () => [...id.querySelectorAll(".mc-time-panel")];
            const openTime = async () => { tml.open = true; await till(() => panels().some(p => p.state == "open" || p.state == "showing"), 3000); await pause(400);
              return panels().find(p => p.state != "closed") || panels()[0]; };
            const panel = await openTime(), inp = panel?.querySelector(".mc-dtp-time input");
            out.time = { grid: tml.menupopup.state, date: dml.menupopup.state, dateRow: !!dml.menupopup.querySelector(".mc-dtp-time"), panel: panel?.state,
                         focus: id.activeElement == inp || !!inp?.matches(":focus"), label: panel?.querySelector(".mc-dtp-time")?.textContent.trim(), value: inp?.value };
            if (inp) { inp.value = "14:35"; inp.dispatchEvent(new iw.Event("input", { bubbles: true })); await pause(400);
              out.time.after = tp.value; out.time.dur = (endTp.value[0] * 60 + endTp.value[1]) - (tp.value[0] * 60 + tp.value[1]); out.time.durBefore = durBefore; }
            await shutPop(panel);
            // Pfeiltasten im Uhrzeitfeld: Stunde weiter (Schreibmarke vorn)
            const fld = tp._inputField; fld.focus(); fld.setSelectionRange(0, 0);
            fld.dispatchEvent(new iw.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })); await pause(300);
            out.time.arrow = tp.value;
            // Mausrad: über den Stunden (links) bzw. Minuten (rechts) je Rastung eine Einheit, Rad nach oben zählt hoch
            const wheel = (el, side, dy) => { const r = el.getBoundingClientRect();
              el.dispatchEvent(new iw.WheelEvent("wheel", { deltaY: dy, deltaMode: 1, clientX: side == "h" ? r.left + 4 : r.right - 4, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); };
            wheel(fld, "h", -1); await pause(200); out.time.wheelHour = tp.value;
            wheel(fld, "m", 1); await pause(200); out.time.wheelMinute = tp.value;
            const panel2 = await openTime(), pin = panel2?.querySelector(".mc-dtp-time input");
            if (pin) { wheel(pin, "m", -1); wheel(pin, "m", -1); await pause(200); out.time.popoverWheel = [tp.value, pin.value]; }
            await shutPop(panel2);
          } finally {
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        if res.get("dialog") is False:
            return False, "Termin-Dialog nicht offen"
        rows, mini, tp = res.get("rows") or [], res.get("mini") or {}, res.get("time") or {}
        desc = res.get("desc") or {}
        # Titel wie in Apple Kalender groß (17 px), Beschriftungen 13 px
        ok = (len(rows) >= 4 and all(r["font"] == "13px" and r["gap"] >= 8 for r in rows) and res["title"] == "17px"
              and desc.get("font") == "13px" and ("system-ui" in desc.get("family", "") or "-apple-system" in desc.get("family", ""))
              and res["overflow"]["doc"][0] <= res["overflow"]["doc"][1] + 1
              and bool(mini) and rgba_alpha(mini["bg"]) == 0 and (mini["today"] is None or rgba_alpha(mini["today"]) == 0)
              and mini["week"] and mini["week"][0] == "400" and not same_color(mini["week"][1], "rgb(155, 158, 194)")
              and bool(tp) and tp["grid"] == "closed" and tp["date"] == "closed" and not tp["dateRow"] and tp["label"] == "Time"
              and tp.get("after") == [14, 35] and tp.get("dur") == tp.get("durBefore") and tp.get("arrow") == [15, 35]
              and tp.get("wheelHour") == [16, 35] and tp.get("wheelMinute") == [16, 34] and tp.get("popoverWheel") == [[16, 36], "16:36"])
        return ok, f"{res}"
    check("Termin-Dialog: Schrift 13 px auch in der Beschreibung, Abstand Beschriftung–Feld; Minimonat ruhig; Uhrzeit-Popover nur für die Uhrzeit, Ende rückt mit, Pfeiltasten, Mausrad", event_dialog, results)

    def event_menu_buttons():
        # Termin-Dialog: Menüknöpfe (Change Privacy, Add Attachments) zeigen den Pfeil ganz – rechts vom Symbol, nicht
        # angeschnitten oder darübergelegt (vorher 9 px Innenabstand für Thunderbirds Pfeil-Hintergrundbild)
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          let dw = null; const out = {};
          try {
            await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Halo Menüknöpfe");
            dw = await winUrl("calendar-event-dialog.xhtml"); if (!dw) return { dialog: false };
            await pause(1800); const dd = dw.document;
            for (const id of ["button-privacy", "button-url"]) {
              const b = dd.getElementById(id), i = b?.querySelector(".toolbarbutton-icon"); if (!b || !i) { out[id] = null; continue; }
              const br = b.getBoundingClientRect(), ir = i.getBoundingClientRect(), s = csOf(b);
              const size = parseFloat(s.backgroundSize) || 0, posX = br.width - (parseFloat(s.backgroundPositionX.match(/([\d.]+)px\)?$/)?.[1]) || 0) - size;
              out[id] = { img: s.backgroundImage.includes("nav-down"), size, chevronLeft: Math.round(posX), iconRight: Math.round(ir.right - br.left), width: Math.round(br.width) };
            }
          } finally { if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); } }
          return out;""")
        if res.get("dialog") is False:
            return False, "Termin-Dialog nicht offen"
        ok = all(v and v["img"] and v["size"] >= 8 and v["chevronLeft"] >= v["iconRight"] + 2 and v["chevronLeft"] + v["size"] <= v["width"] - 4
                 for v in res.values())
        return ok, f"{res}"
    check("Termin-Dialog: Pfeil in „Change Privacy“ und „Add Attachments“ ganz sichtbar neben dem Symbol", event_menu_buttons, results)

    def event_apple_layout():
        # Termin-Fenster wie Apple Kalender: Karten in der Reihenfolge Titel · Zeit · Ort · Teilnehmer · Kalender ·
        # Kategorie, darunter die Notiz; Streifen in der Kalenderfarbe; Platzhalter statt Beschriftungen; ohne Reiter
        # und Formatleiste, solange es keine Anhänge/Teilnehmer gibt
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          let dw = null; const out = {};
          try {
            testCalendar().setProperty("color", "#FF9500");
            await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Halo Apple");
            dw = await winUrl("calendar-event-dialog.xhtml"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document?.documentElement?.hasAttribute("mc-apple-event") && f; }, 8000);
            if (!iw) return { apple: false };
            await pause(800); const id = iw.document, R = e => e.getBoundingClientRect();
            const rows = [...id.querySelectorAll("#event-grid > tr[data-mc-card]")].filter(r => R(r).height).sort((a, b) => R(a).top - R(b).top);
            out.cards = [...new Set(rows.map(r => r.dataset.mcCard))];
            const st = id.getElementById("mc-calendar-stripe");
            out.stripe = st ? csOf(st).backgroundColor : null;
            out.stripeSpan = st ? [Math.round(R(st).top - R(id.getElementById("event-grid-title-row")).top), Math.round(R(id.getElementById("event-grid-alarm-row")).bottom - R(st).bottom)] : null;
            out.placeholders = [id.getElementById("item-location")?.placeholder, id.querySelector(".mc-invitees")?.textContent,
                                id.getElementById("item-description")?.contentDocument?.body?.getAttribute("data-mc-placeholder")];
            out.labels = ["item-title-label", "item-location-label", "item-calendar-label"].map(x => vis(id.getElementById(x)));
            out.timeLabel = vis(id.querySelector("#event-grid-startdate-label-box label"));
            out.tabs = vis(id.getElementById("event-grid-tabs")); out.format = vis(id.getElementById("FormatToolbox"));
            out.notesBelow = R(id.getElementById("event-grid-tab-vbox")).top >= R(rows.at(-1)).bottom;
            out.title = csOf(id.getElementById("item-title")).fontSize;
            // Datum/Uhrzeit schmal wie ihr Text, ohne Fläche und Pfeil; Kategorie bündig mit dem Text der übrigen Karten
            const dml = id.querySelector("#event-starttime datepicker > menulist"), tml = id.querySelector("#event-starttime timepicker > menulist");
            out.pickers = [Math.round(R(dml).width), Math.round(R(tml).width), rgba(csOf(dml).backgroundColor)[3],
                           iw.getComputedStyle(dml.shadowRoot.querySelector("dropmarker")).visibility];
            out.catLeft = Math.round(R(id.getElementById("item-categories-label")).left - R(id.getElementById("event-grid-location-row")).left);
            out.locLeft = Math.round(R(id.getElementById("item-location")).left - R(id.getElementById("event-grid-location-row")).left);
          } finally { if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); } }
          return out;""")
        if res.get("dialog") is False or res.get("apple") is False:
            return False, f"Termin-Dialog nicht wie erwartet {res}"
        ok = (res["cards"] == ["title", "time", "location", "invitees", "calendar", "category"]
              and same_color(res["stripe"] or "", "rgb(255, 149, 0)") and res["stripeSpan"] and all(0 <= v <= 10 for v in res["stripeSpan"])
              and res["placeholders"] == ["Add Location or Video Call", "Add Invitees", "Add Notes or URL"]
              and res["labels"] == [False, False, False] and res["timeLabel"] and not res["tabs"] and not res["format"]
              and res["notesBelow"] and res["title"] == "17px"
              and res["pickers"][0] <= 120 and res["pickers"][1] <= 100 and res["pickers"][2] == 0 and res["pickers"][3] == "hidden"
              and abs(res["catLeft"] - res["locLeft"]) <= 4)
        return ok, f"{res}"
    check("Termin-Dialog wie Apple Kalender: Karten Titel · Zeit · Ort · Teilnehmer · Kalender · Kategorie, Notiz unten, Streifen in der Kalenderfarbe, Platzhalter, Datum/Uhrzeit schmal ohne Kasten, Kategorie bündig", event_apple_layout, results)

    def attendees_dialog():
        # „Teilnehmer einladen“: Liste und Raster ohne harten Rahmen, Linien als Haarlinie, einfarbige Symbole,
        # Legende ohne Rahmen, gewählte Zeit in Akzentfarbe statt Pink; Beginn/Ende mit kombiniertem Popover
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          let dw = null, aw = null; const out = {};
          try {
            await toCalendar(); w.switchToView("week"); w.createEventWithDialog(testCalendar(), null, null, "Halo Teilnehmer");
            dw = await winUrl("calendar-event-dialog.xhtml"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById("event-grid") && f; }, 8000);
            await pause(800);
            iw.setTimeout(() => iw.editAttendees(), 0);
            aw = await winUrl("calendar-event-dialog-attendees"); if (!aw) return { attendees: false };
            await pause(1500); const ad = aw.document;
            const list = ad.getElementById("attendee-list"), grid = ad.getElementById("freebusy-grid"), inner = ad.getElementById("freebusy-grid-inner");
            const bar = ad.getElementById("event-bar-top"), legend = ad.querySelector('.legend[status="BUSY"]'), role = ad.querySelector("event-attendee .role-icon, .role-icon");
            out.list = { border: csOf(list).borderTopWidth, radius: csOf(list).borderTopLeftRadius, lines: csOf(list).backgroundImage.slice(0, 30) };
            out.grid = { border: csOf(grid).borderTopWidth, lines: csOf(inner).backgroundImage.includes("threedshadow") ? "alt" : csOf(inner).backgroundImage.slice(0, 30) };
            const low = ad.getElementById("event-bar-bottom"), head = ad.getElementById("day-header-outer");
            // Rahmen der gewählten Zeit nur über dem Raster, nicht im Kopf mit den Uhrzeiten
            out.bar = { border: csOf(low).borderTopColor, accent: colorOf(ad, "var(--mt-accent)"), topVisible: csOf(bar).borderTopColor != "rgba(0, 0, 0, 0)" || csOf(bar).backgroundColor != "rgba(0, 0, 0, 0)",
                        below: Math.round(low.getBoundingClientRect().top) >= Math.round(head.getBoundingClientRect().bottom) - 1, topWidth: csOf(low).borderTopWidth };
            out.legend = { border: csOf(legend).borderTopWidth, radius: csOf(legend).borderTopLeftRadius, w: csOf(legend).width, h: csOf(legend).height };
            // Beschriftungen der Legenden (Rolle, Art, Status) alle in derselben grauen Schrift
            out.labelColors = [...new Set([...ad.querySelectorAll("table:has(:is(.legend, .role-icon, .usertype-icon)) td")]
              .filter(td => td.textContent.trim() && vis(td)).map(td => csOf(td).color))];
            out.grid.rows = csOf(inner).backgroundImage.includes("to bottom");
            out.icon = role ? (csOf(role).content || "").slice(0, 60) : null;
            out.combined = !!ad.querySelector(".mc-time-panel .mc-dtp-time") && !ad.querySelector("#event-starttime datepicker menupopup .mc-dtp-time");
          } finally {
            if (aw && !aw.closed) { aw.close(); await till(() => aw.closed, 4000); }
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
          }
          return out;""")
        if res.get("dialog") is False or res.get("attendees") is False:
            return False, f"Dialog nicht offen {res}"
        # wie Apple Kalender: Liste ohne Zeilenlinien, Raster nur mit senkrechten Stundenlinien, Legende als Farbpunkte
        ok = (res["list"]["border"] == "0px" and res["list"]["radius"] == "8px" and res["list"]["lines"] == "none"
              and res["grid"]["border"] == "0px" and res["grid"]["lines"].startswith("linear-gradient") and not res["grid"]["rows"]
              and same_color(res["bar"]["border"], res["bar"]["accent"]) and not res["bar"]["topVisible"] and res["bar"]["below"] and res["bar"]["topWidth"] == "1px"
              and res["legend"]["border"] == "0px" and res["legend"]["radius"] == "50%" and res["legend"]["w"] == res["legend"]["h"]
              and len(res["labelColors"]) == 1
              and res["icon"] and "mailcards/icons/user.svg" in res["icon"] and res["combined"])
        return ok, f"{res}"
    check("Termin: „Teilnehmer einladen“ ohne Zeilenlinien, zarte Stundenlinien, Legende als Farbpunkte, einfarbige Symbole, Akzent statt Pink, Datum/Uhrzeit-Popover", attendees_dialog, results)

    def event_window_still():
        # Termin-Fenster springt nach dem Öffnen nicht: Detailansicht (Doppelklick auf einen Termin) und Bearbeiten –
        # Lage/Größe des Fensters und Lage des Titelfelds vom ersten sichtbaren Bild an unverändert (früher passte
        # halo.spaces die Detailansicht erst nach 250 ms an, die Beschriftungen nach 300 ms)
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Ruhetermin"; e.calendar = c;
          const s = cal.dtz.now(); s.hour = 10; s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          e.setProperty("DESCRIPTION", "Erfundene Beschreibung."); const saved = await c.addItem(e);
          await toCalendar();
          const watch = async (open, part) => {
            const known = new Set([...Services.wm.getEnumerator(null)]);
            open();
            const dw = await till(() => [...Services.wm.getEnumerator(null)].find(x => !known.has(x)), 6000);
            if (!dw) return null;
            const seen = []; const t0 = Date.now();
            while (Date.now() - t0 < 1800) {
              let field = null;
              try {
                const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
                const el = f?.getElementById("item-title") || dw.document.querySelector(".item-title");
                // ein noch unsichtbares Formular zählt nicht als gezeigt
                const shown = !f || f.defaultView.getComputedStyle(f.documentElement).visibility != "hidden";
                if (el && shown) { const r = el.getBoundingClientRect(); field = [Math.round(r.left), Math.round(r.top)]; }
              } catch {}
              // erst ab dem ersten sichtbaren Bild: Thunderbird zeigt das Fenster, wenn es fertig geladen ist
              if (dw.document.readyState == "complete" && dw.outerWidth > 100 && field) {
                const st = JSON.stringify([dw.screenX, dw.screenY, dw.outerWidth, dw.outerHeight, field]);
                if (seen.at(-1)?.[1] != st) seen.push([Date.now() - t0, st]);
              }
              await pause(16);
            }
            const url = dw.location.href;
            dw.close(); await till(() => dw.closed, 4000);
            return { url: url.split("/").pop(), states: seen };
          };
          const out = {};
          try {
            out.edit = await watch(() => w.modifyEventWithDialog(saved, true));
            await pause(600);
            out.summary = await watch(() => w.openEventDialogForViewing(saved));
          } finally {
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        sm, ed = res.get("summary") or {}, res.get("edit") or {}
        ok = (sm.get("url", "").startswith("calendar-summary-dialog") and len(sm.get("states", [])) == 1
              and ed.get("url", "").startswith("calendar-event-dialog") and len(ed.get("states", [])) == 1)
        return ok, f"{res}"
    check("Termin-Fenster (Detailansicht und Bearbeiten) springt nach dem Öffnen nicht", event_window_still, results)

    def event_dialog_lines():
        # Termin-Dialog: Trennlinien im Raster als Haarlinie (Thunderbird: 1 px Feldrahmenfarbe); Statuszeile mit Abstand
        # zwischen Beschriftung und Wert („Time as: Busy“ statt „Time as:Busy“); Beschreibung dunkel lesbar (früher schwarz auf #1E1E1E)
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Linientermin"; e.calendar = c;
          const s = cal.dtz.now(); s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          e.setProperty("DESCRIPTION", "Erfundene Beschreibung zum Kontrast."); e.setProperty("TRANSP", "OPAQUE"); e.setCategories(["Business"]); const saved = await c.addItem(e);
          const out = { dark };
          let dw = null;
          try {
            await toCalendar(); w.modifyEventWithDialog(saved, true);
            dw = await winUrl("calendar-event-dialog"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById("event-grid") && f; }, 8000);
            const id = iw.document, ed = id.getElementById("item-description");
            const body = await till(() => { const b = ed.contentDocument?.body; return b && /Erfundene/.test(b.textContent) && b; }, 6000);
            await pause(1800);
            out.seps = [...id.querySelectorAll("#event-grid tr.separator td")].filter(vis).map(td => [csOf(td).borderBottomColor, csOf(td).borderBottomWidth]);
            // Statuszeile „Time as: Busy“ (nur bei gesetzter Verfügbarkeit sichtbar)
            const fb = await till(() => { const p = dw.document.getElementById("status-freebusy"); return vis(p) && p; }, 3000);
            const labs = fb ? [...fb.querySelectorAll(":scope > label")].filter(l => !l.hidden && vis(l)) : [];
            out.status = labs.length >= 2 ? Math.round((labs[1].getBoundingClientRect().left - labs[0].getBoundingClientRect().right) * 10) / 10 : null;
            out.statusText = labs.map(l => l.value || l.textContent).join("|");
            out.shadows = [...new Set([...dw.document.querySelectorAll("#status-bar :is(label, description)")].map(l => csOf(l).textShadow))];
            // Kategorien: Farbpunkte im Menü mit feinem Ring, Farbchip der gewählten Kategorie im Feld mit Haarlinie
            const cats = id.getElementById("item-categories"), cp = id.getElementById("item-categories-popup") || cats?.menupopup;
            const mt = cp && [...cp.querySelectorAll(":scope > menuitem .menu-text")][0];
            out.catDot = mt ? csOf(mt).backgroundImage.slice(0, 20) : null;
            const chip = cats?.shadowRoot?.querySelector('[part~="color"]');
            out.catChip = chip ? csOf(chip).boxShadow : null;
            // Fläche hinter dem Text: durchscheinende Kartenflächen auf den ersten deckenden Hintergrund darunter mischen
            const rgba = c => { const v = (c.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = c.startsWith("color(") ? 255 : 1;
                                 return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
            const layers = [];
            for (let el = ed; el && el.nodeType == 1; el = el.parentElement) {
              const b = csOf(el).backgroundColor; if (b == "transparent") continue;
              const v = rgba(b); if (v[3] == 0) continue; layers.push(v); if (v[3] >= 1) break;
            }
            let mix = layers.length && layers.at(-1)[3] >= 1 ? layers.pop() : (out.dark ? [0, 0, 0, 1] : [255, 255, 255, 1]);
            for (const l of layers.reverse()) mix = mix.map((m, i) => i < 3 ? l[i] * l[3] + m * (1 - l[3]) : 1);
            const bg = layers.length || mix ? `rgb(${mix.slice(0, 3).map(Math.round).join(", ")})` : null;
            out.desc = body ? { color: csOf(body).color, body: csOf(body).backgroundColor, field: bg } : null;
          } finally {
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        if res.get("dialog") is False:
            return False, "Termin-Dialog nicht offen"
        seps, desc = res.get("seps") or [], res.get("desc") or {}
        ok_desc = bool(desc) and (rgba_alpha(desc["body"]) == 0 or not res["dark"]) and (
            contrast(desc["color"], desc["field"]) >= 4.5 if res["dark"] else luminance(desc["color"]) < 0.2)
        # Termin wie Apple Kalender: Karten statt Trennlinien – sichtbare Trenner dürfen nur Haarlinien sein
        ok = (all(rgba_alpha(c) <= 0.12 and float(wd[:-2]) <= 1 for c, wd in seps)
              and res.get("status") is not None and res["status"] >= 3 and ok_desc
              and res.get("shadows") == ["none"] and (res.get("catDot") or "").startswith("radial-gradient")
              and res.get("catChip") not in (None, "none"))
        return ok, f"{res}"
    check("Termin-Dialog: Trenner höchstens als Haarlinie, „Time as: Busy“ mit Abstand ohne Prägeschatten, Beschreibung lesbar (dunkel ≥ 4,5:1), Kategorie-Farbpunkte mit Ring", event_dialog_lines, results)

    def summary_description():
        # Lesefenster (Termin → Öffnen): Beschreibung im eigenen Inhaltsdokument (iframe.item-description) dunkel
        # lesbar und in der Systemschrift – früher schwarz auf grau (Meldung unter Windows mit dunklem Theme)
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Lesetermin"; e.calendar = c;
          const s = cal.dtz.now(); s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          e.setProperty("DESCRIPTION", "Erfundene Beschreibung zum Lesen."); const saved = await c.addItem(e);
          const out = { dark };
          let dw = null;
          try {
            await toCalendar(); w.openEventDialogForViewing(saved);
            dw = await winUrl("calendar-summary-dialog"); if (!dw) return { dialog: false };
            const fr = await till(() => dw.document.querySelector(".item-description"), 6000);
            const body = fr && await till(() => { const b = fr.contentDocument?.body; return b && /Erfundene/.test(b.textContent) && b; }, 6000);
            await pause(1200);
            if (!body) return { ...out, body: false };
            const bcs = fr.contentWindow.getComputedStyle(body);
            const rgba = c => { const v = (c.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = c.startsWith("color(") ? 255 : 1;
                                 return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
            // Fläche hinter dem Text: Body des Inhaltsdokuments, dann die Elemente um das iframe bis zum ersten deckenden
            const layers = [];
            const add = b => { if (b == "transparent") return false; const v = rgba(b); if (v[3] == 0) return false; layers.push(v); return v[3] >= 1; };
            if (!add(bcs.backgroundColor)) {
              for (let el = fr; el && el.nodeType == 1; el = el.parentElement) if (add(csOf(el).backgroundColor)) break;
            }
            let mix = layers.length && layers.at(-1)[3] >= 1 ? layers.pop() : (out.dark ? [0, 0, 0, 1] : [255, 255, 255, 1]);
            for (const l of layers.reverse()) mix = mix.map((m, i) => i < 3 ? l[i] * l[3] + m * (1 - l[3]) : 1);
            out.desc = { color: bcs.color, field: `rgb(${mix.slice(0, 3).map(Math.round).join(", ")})`, size: bcs.fontSize };
          } finally {
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        if res.get("dialog") is False:
            return False, "Lesefenster nicht offen"
        desc = res.get("desc") or {}
        ok = bool(desc) and desc.get("size") == "13px" and contrast(desc["color"], desc["field"]) >= 4.5
        return ok, f"{res}"
    check("Termin-Lesefenster: Beschreibung in Systemschrift und lesbar (≥ 4,5:1, auch dunkel)", summary_description, results)

    def reminder_dialog():
        # Erinnerungen anpassen: Liste ohne native Rahmenzeichnung, mit Haarlinie; Trenner neben den Überschriften fein
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Erinnerungstermin"; e.calendar = c;
          const s = cal.dtz.now(); s.minute = 0; s.second = 0; s.day += 1; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          const saved = await c.addItem(e);
          const out = { dark };
          let dw = null, rw = null;
          try {
            await toCalendar(); w.modifyEventWithDialog(saved, true);
            dw = await winUrl("calendar-event-dialog.xhtml"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById("item-alarm") && f; }, 8000);
            await pause(800);
            const ml = iw.document.getElementById("item-alarm"); ml.value = "custom"; later(() => iw.updateReminder());
            rw = await winUrl("calendar-event-dialog-reminder"); if (!rw) return { reminder: false };
            await pause(1200);
            const rd = rw.document, lb = rd.getElementById("reminder-listbox");
            out.list = { appearance: csOf(lb).appearance, border: csOf(lb).borderTopColor, bw: csOf(lb).borderTopWidth };
            out.seps = [...rd.querySelectorAll("separator.groove")].filter(vis).map(x => [csOf(x).borderTopColor, csOf(x).borderTopWidth]);
          } finally {
            if (rw && !rw.closed) { rw.close(); await till(() => rw.closed, 4000); }
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        if res.get("dialog") is False or res.get("reminder") is False:
            return False, f"Dialog nicht offen {res}"
        lst, seps = res.get("list") or {}, res.get("seps") or []
        ok = (lst.get("appearance") == "none" and rgba_alpha(lst["border"]) <= 0.12 and float(lst["bw"][:-2]) <= 1
              and len(seps) >= 2 and all(float(wd[:-2]) <= 1 and not same_color(c, "rgba(128, 128, 128, 0.6)") and rgba_alpha(c) <= 0.12 for c, wd in seps))
        return ok, f"{res}"
    check("Erinnerungen anpassen: Liste und Trenner als Haarlinie ohne native Rahmen", reminder_dialog, results)

    def recurrence_preview():
        # Wiederholung: Monate der Vorschau mit Haarlinie und 10 px Radius statt 1 px Zinkgrau (dunkel #71717A), ohne Fläche
        res = m.js(CAL_CHECK_JS + r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const out = { dark };
          let dw = null, rw = null;
          try {
            await toCalendar(); w.createEventWithDialog(testCalendar(), null, null, "Halo Wiederholungsvorschau");
            dw = await winUrl("calendar-event-dialog.xhtml"); if (!dw) return { dialog: false };
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById("item-repeat") && f; }, 8000);
            await pause(800);
            const ml = iw.document.getElementById("item-repeat"); ml.value = "custom"; later(() => iw.editRepeat ? iw.editRepeat() : iw.updateRepeat());
            rw = await winUrl("calendar-event-dialog-recurrence"); if (!rw) return { recurrence: false };
            await pause(1500);
            const rd = rw.document, mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
            const lab = [...rd.querySelectorAll("label.recurrence-pattern-hbox-label")].find(vis), pl = rd.getElementById("period-list");
            const dd = rd.getElementById("daily-days");
            out.align = lab && pl ? Math.round((mid(lab) - mid(pl)) * 10) / 10 : null;
            out.heights = [pl && Math.round(pl.getBoundingClientRect().height * 10) / 10, dd && vis(dd) ? Math.round(dd.getBoundingClientRect().height * 10) / 10 : null];
            out.months = [...rw.document.querySelectorAll("#recurrencePreview calendar-minimonth")].filter(vis).map(mm => { const st = csOf(mm);
              return { bg: st.backgroundColor, bw: st.borderTopWidth, border: st.borderTopColor, radius: st.borderTopLeftRadius,
                       busy: [...mm.querySelectorAll("td[busy]")].length }; });
          } finally {
            if (rw && !rw.closed) { rw.close(); await till(() => rw.closed, 4000); }
            if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); }
          }
          return out;""")
        if res.get("dialog") is False or res.get("recurrence") is False:
            return False, f"Dialog nicht offen {res}"
        ms = res.get("months") or []
        ok = (len(ms) >= 1 and all(rgba_alpha(x["bg"]) == 0 and float(x["bw"][:-2]) <= 1 and rgba_alpha(x["border"]) <= 0.12
                                   and not same_color(x["border"], "rgb(113, 113, 122)") and float(x["radius"][:-2]) >= 10 for x in ms)
              and any(x["busy"] for x in ms))
        al, hs = res.get("align"), res.get("heights") or [None, None]
        ok = ok and al is not None and abs(al) <= 1 and None not in hs and abs(hs[0] - 28) <= 1 and abs(hs[1] - 28) <= 1
        return ok, f"{res}"
    check("Wiederholung: Vorschau-Monate mit Haarlinie und 10 px Radius, ohne Fläche, Belegt-Punkte bleiben; „Repeat“ mittig zur Liste, Zahlenfeld 28 px", recurrence_preview, results)

    def today_weather():
        # Wetter in der Today-Pane (Option, aus): Stadt → Koordinaten (gerundet) → Symbol und Temperatur im Tooltip;
        # ohne Stadt der Standort, verweigert → Hinweis und Sonne; aus → wieder die Sonne. Open-Meteo nachgestellt (kein Netz)
        res = m.js(CAL_CHECK_JS + r"""
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const api = Cu.evalInSandbox("mailCards.prototype.getAPI({})", g).mailCards;
          const title = d.getElementById("mcTodayTitle");
          const out = { start: { attr: title.dataset.weather || null, setting: (await api.getSettings()).weather } };
          Cu.evalInSandbox(`globalThis.__mcRealFetch = fetchWithTimeout; globalThis.__mcUrls = [];
            fetchWithTimeout = async (win, url) => { __mcUrls.push(url);
              const body = url.includes("geocoding") ? { results: [{ name: "Wien", country: "Österreich", latitude: 48.20849, longitude: 16.37208 }] }
                : { current: { weather_code: 61, is_day: 1, temperature_2m: 12.3 } };
              return { ok: true, status: 200, text: async () => JSON.stringify(body) }; };
            globalThis.__mcRealLocate = Weather.locate; Weather.locate = async () => ({ error: "denied" });`, g);
          try {
            await api.setSetting("weatherPlace", "Wien"); await api.setSetting("weather", true); await pause(400);
            const st = await api.getSettings();
            out.city = { attr: title.dataset.weather, tip: title.getAttribute("title"), status: st.weatherStatus,
                         mask: w.getComputedStyle(title, "::after").maskImage.slice(0, 80), urls: Cu.evalInSandbox("JSON.stringify(__mcUrls)", g) };
            await api.setSetting("weatherPlace", ""); await pause(400);
            out.located = { attr: title.dataset.weather || null, status: (await api.getSettings()).weatherStatus };
            await api.setSetting("weather", false); await pause(300);
            out.off = { attr: title.dataset.weather || null, tip: title.getAttribute("title") };
          } finally {
            Cu.evalInSandbox("fetchWithTimeout = __mcRealFetch; Weather.locate = __mcRealLocate;", g);
            for (const p of ["weather", "weatherPlace", "weatherState"]) Services.prefs.clearUserPref("extensions.mailcards." + p);
          }
          return out;""" % ADDON_ID)
        c, l, o = res.get("city") or {}, res.get("located") or {}, res.get("off") or {}
        urls = json.loads(c.get("urls") or "[]")
        ok = (res["start"] == {"attr": None, "setting": False}
              and c.get("attr") == "rain" and c.get("tip") == "Wien, Österreich: 12 °C" and "Wien" in (c.get("status") or "")
              and "weather/rain.svg" in c.get("mask", "") and any("latitude=48.21&longitude=16.37" in u for u in urls)
              and l.get("attr") is None and "System Settings" in (l.get("status") or "")
              and o == {"attr": None, "tip": None})
        return ok, f"{res}"
    check("Today-Pane: Wetter (Option) – Stadt → Symbol und Temperatur, Standort verweigert → Hinweis und Sonne, aus → Sonne", today_weather, results)

    def agenda_days():
        # Today-Pane: Tagesspalte (ca. 38 px) eines Tags mit nur einem Eintrag ragte bis auf 2–6 px an den nächsten Tag
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const added = [];
          try {
            for (const [dd, title] of [[2, "Halo Agenda Einzeltag"], [3, "Halo Agenda Folgetag"], [4, "Halo Agenda Drittag"]]) {
              const e = new CalEvent(); e.title = title; e.calendar = c; const s = today(); s.day += dd; const en = s.clone(); en.day += 1;
              e.startDate = s; e.endDate = en; added.push(await c.addItem(e)); }
            await toMail(); if (!w.TodayPane?.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand();
            await pause(2000);
            const lis = [...d.querySelectorAll("#agenda > li.agenda-listitem")].filter(vis);
            const out = { pairs: [], single: 0 };
            lis.forEach((li, i) => { const h = li.querySelector(":scope > .agenda-date-header"); if (!h || h.hidden) return;
              const next = lis.slice(i + 1).find(x => { const nh = x.querySelector(":scope > .agenda-date-header"); return nh && !nh.hidden; });
              if (!next) return;
              const single = lis[i + 1] == next; if (single) out.single++;
              out.pairs.push([h.dataset.mcDay, single, Math.round(next.querySelector(":scope > .agenda-date-header").getBoundingClientRect().top - h.getBoundingClientRect().bottom)]); });
            return out;
          } finally { for (const it of added) try { await c.deleteItem(it); } catch {} }""")
        ps = res.get("pairs") or []
        ok = res.get("single", 0) >= 1 and len(ps) >= 2 and all(gap >= 12 for _, _, gap in ps)
        return ok, f"{res}"
    check("Today-Pane: Tage mit nur einem Eintrag ragen nicht in den nächsten Tag", agenda_days, results)

    def occurrence_prompt():
        # Rückfrage wiederholter Termin: Titelkasten ohne harten Rahmen, Kapselknöpfe ohne alte Kalendersymbole
        res = m.js(CAL_CHECK_JS + r"""
          const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Serientermin"; e.calendar = c;
          const s = cal.dtz.now(); s.minute = 0; s.second = 0; s.day -= 7; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          e.recurrenceInfo = new CalRecurrenceInfo(e); e.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=WEEKLY;COUNT=10"));
          const saved = await c.addItem(e);
          const out = {};
          let pw = null;
          try {
            await toCalendar(); w.switchToView("week"); await pause(800);
            const occ = saved.recurrenceInfo.getNextOccurrence(cal.dtz.now()) || saved;
            later(() => w.calendarViewController.deleteOccurrences([occ], false, false));
            pw = await winUrl("calendar-occurrence-prompt"); if (!pw) return { prompt: false };
            await pause(1000);
            const pd = pw.document, h = pd.getElementById("occurrence-prompt-header");
            out.header = { bw: csOf(h).borderTopWidth, radius: csOf(h).borderTopLeftRadius };
            out.buttons = [...pd.querySelectorAll(".occurrence-accept-buttons")].filter(vis).map(b => { const ic = b.querySelector(".button-icon");
              // Textbereich: das Label (.button-text) ist so breit wie sein Text
              const lab = b.querySelector(".button-text"), t = lab ? lab.getBoundingClientRect() : { width: 0, left: 0, right: 0 }, br = b.getBoundingClientRect();
              return { img: csOf(b).listStyleImage, icon: !!ic && vis(ic), tw: Math.round(t.width), bw: Math.round(br.width),
                       padL: Math.round((t.left - br.left) * 10) / 10, padR: Math.round((br.right - t.right) * 10) / 10 }; });
          } finally {
            if (pw && !pw.closed) { pw.close(); await till(() => pw.closed, 4000); await pause(500); }
            try { await c.deleteItem(saved); } catch {}
          }
          return out;""")
        if res.get("prompt") is False:
            return False, "Rückfrage nicht offen"
        b = res.get("buttons") or []
        ok = res["header"]["bw"] == "0px" and len(b) >= 2 and all(x["img"] == "none" and not x["icon"] for x in b)
        ok = ok and all(0 < x["tw"] < x["bw"] - 20 and abs(x["padL"] - x["padR"]) <= 2 for x in b)
        return ok, f"{res}"
    check("Rückfrage wiederholter Termin: Titelkasten ohne harten Rahmen, Knöpfe ohne alte Kalendersymbole, Text mittig", occurrence_prompt, results)

    def quick_segment():
        # Schnellfenster: gewähltes Segment („Termin“/„Aufgabe“) heller als die Spur – dunkel früher dunkler (#1E1E1E)
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(vis);
          li.querySelector("button").click();
          const qp = await till(() => { const q = d.getElementById("mcQuickPanel"); return q?.state == "open" && q; }, 4000);
          if (!qp) return { open: false, visibility: d.visibilityState };
          await pause(300);
          try {
            const sel = qp.querySelector(".mc-qc-seg > button[selected]");
            return { open: true, dark, sel: sel ? csOf(sel).backgroundColor : null, track: csOf(qp.querySelector(".mc-qc-seg")).backgroundColor };
          } finally { await shutPop(qp); }""")
        if not res.get("open"):
            return res.get("visibility") == "hidden", f"Schnellfenster nicht offen {res}"
        sel = res.get("sel")
        ok = bool(sel) and (luminance(sel) > 0.08 and rgba_alpha(sel) == 1 if res["dark"] else same_color(sel, "rgb(255, 255, 255)"))
        return ok, f"{res}"
    check("Schnellfenster: gewähltes Segment heller als die Spur (auch dunkel)", quick_segment, results)

    def quick_allday_calrow():
        # Schnellfenster: „All Day“ als macOS-Kästchen (früher grau gefülltes Systemkästchen ohne Rand, wirkte deaktiviert);
        # Kalendername 8 px hinter dem Farbpunkt statt ca. 21 px (Innenabstand der Auswahl)
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(vis);
          li.querySelector("button").click();
          const qp = await till(() => { const q = d.getElementById("mcQuickPanel"); return q?.state == "open" && q; }, 4000);
          if (!qp) return { open: false, visibility: d.visibilityState };
          await pause(300);
          const out = { open: true, dark, checkBg: colorOf(d, "var(--mt-check-bg)", "backgroundColor"), accent: colorOf(d, "var(--mt-accent)", "backgroundColor") };
          try {
            const f = qp.__mc; if (!vis(f.allDay)) { f.summary.click(); await pause(600); }
            const cb = f.allDay, st = csOf(cb);
            out.cb = { app: st.appearance, bw: st.borderTopWidth, bg: st.backgroundColor, w: Math.round(cb.getBoundingClientRect().width) };
            const was = cb.checked; cb.click(); await pause(250);
            out.cbOn = { checked: cb.checked, bg: csOf(cb).backgroundColor, img: csOf(cb).backgroundImage.slice(0, 20) };
            if (cb.checked != was) { cb.click(); await pause(150); }
            const sel = f.calendar, card = sel.closest(".mc-qc-calcard");
            out.calGap = Math.round((sel.getBoundingClientRect().left + parseFloat(csOf(sel).paddingInlineStart)
              - (card.getBoundingClientRect().left + parseFloat(csOf(card).paddingInlineStart) + 12)) * 10) / 10;
            return out;
          } finally { await shutPop(qp); }""")
        if not res.get("open"):
            return res.get("visibility") == "hidden", f"Schnellfenster nicht offen {res}"
        cb, on = res.get("cb") or {}, res.get("cbOn") or {}
        ok = (cb.get("app") == "none" and float(cb["bw"][:-2]) >= 0.5 and same_color(cb["bg"], res["checkBg"])
              and on.get("checked") and same_color(on["bg"], res["accent"]) and on["img"].startswith("url(")
              and res.get("calGap") is not None and res["calGap"] <= 10)
        return ok, f"{res}"
    check("Schnellfenster: „Ganztägig“ als macOS-Kästchen, Kalendername dicht am Farbpunkt", quick_allday_calrow, results)

    def quick_time_fits():
        # Schnellfenster aufgeklappt: Datum, Uhrzeit (samt Uhrsymbol) und Auswahllisten bleiben auf der grauen Karte
        # (früher feste 96-px-Labelspalte – das Uhrsymbol ragte über die Kartenkante); Labels ungekürzt, Felder bündig
        res = m.js(CAL_CHECK_JS + r"""
          await toWeek();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(vis);
          li.querySelector("button").click();
          const qp = await till(() => { const q = d.getElementById("mcQuickPanel"); return q?.state == "open" && q; }, 4000);
          if (!qp) return { open: false, visibility: d.visibilityState };
          await pause(300);
          try {
            const f = qp.__mc; if (!qp.querySelector(".mc-qc[data-expanded]")) { f.summary.click(); await pause(600); }
            const card = qp.querySelector(".mc-qc-time"), cr = card.getBoundingClientRect();
            const fields = [...card.querySelectorAll('input[type="date"], input[type="time"], select')].filter(vis).map(e => {
              const r = e.getBoundingClientRect();
              return { t: e.type || e.localName, over: Math.round((r.right - (cr.right - 4)) * 10) / 10,
                       clip: e.type == "time" ? e.scrollWidth - e.clientWidth : 0, left: Math.round(r.left) };
            });
            const labels = [...card.querySelectorAll(".mc-qc-row > label")].filter(vis).map(l => ({ t: l.textContent, clip: l.scrollWidth - l.clientWidth }));
            const ctrlLefts = [...new Set([...card.querySelectorAll(".mc-qc-row")].filter(vis).map(r => Math.round(r.querySelector(".mc-qc-ctrl").getBoundingClientRect().left)))];
            return { open: true, fields, labels, ctrlLefts, card: Math.round(cr.width) };
          } finally { await shutPop(qp); }""")
        if not res.get("open"):
            return res.get("visibility") == "hidden", f"Schnellfenster nicht offen {res}"
        fields, labels = res.get("fields") or [], res.get("labels") or []
        ok = (sum(1 for x in fields if x["t"] == "time") >= 2 and all(x["over"] <= 0 for x in fields)
              and all(x["clip"] <= 1 for x in fields) and len(labels) >= 5 and all(x["clip"] <= 0 for x in labels)
              and len(res.get("ctrlLefts") or []) == 1)
        return ok, f"{res}"
    check("Schnellfenster: Uhrzeit samt Uhrsymbol innerhalb der Karte, Labels ungekürzt, Felder bündig", quick_time_fits, results)

    def enable_badge():
        # Kalenderliste: Plakette „Aktivieren“ als graue Kapsel statt schieferblauer Fläche mit weißer Großschrift
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); c.setProperty("disabled", true);
          try {
            await toCalendar();
            const b = await till(() => [...d.querySelectorAll("#calendar-list button.calendar-enable-button")].find(vis), 4000);
            if (!b) return { badge: false };
            // Haken im Farbkästchen des deaktivierten, eingeblendeten Kalenders: Textfarbe statt weiß
            const li = b.closest("li"), shown = li?.querySelector("input.calendar-displayed")?.checked;
            const sw = li?.querySelector(".calendar-color");
            return { bg: csOf(b).backgroundColor, color: csOf(b).color, tt: csOf(b).textTransform, weight: csOf(b).fontWeight, radius: csOf(b).borderTopLeftRadius,
                     dark: w.matchMedia("(prefers-color-scheme: dark)").matches, disabled: li?.hasAttribute("calendar-disabled"), shown,
                     tick: sw ? w.getComputedStyle(sw, "::after").backgroundColor : null };
          } finally { c.setProperty("disabled", false); await pause(500); }""")
        if res.get("badge") is False:
            return False, "Plakette nicht sichtbar"
        ok = (not same_color(res["bg"], "rgb(107, 128, 164)") and not same_color(res["color"], "rgb(255, 255, 255)")
              and res["tt"] == "none" and int(res["weight"]) <= 600)
        if res.get("shown"):
            ok = ok and res.get("disabled") and same_color(res["tick"], "rgb(161, 161, 166)" if res["dark"] else "rgb(110, 110, 115)")
        else:
            ok = False
        return ok, f"{res}"
    check("Kalenderliste: Plakette „Aktivieren“ als graue Kapsel ohne Großschrift; Haken des deaktivierten Kalenders grau statt weiß", enable_badge, results)

    def print_minimonths():
        # Drucken: „Von“/„Bis“-Minikalender passen ins Formular, Pfeile sichtbar, Knöpfe ohne helle Fläche (dunkel)
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900); await pause(600); await toCalendar(); w.switchToView("week"); await pause(800);
          later(() => w.goDoCommand("cmd_print"));
          const frame = await till(() => [...d.querySelectorAll(".dialogFrame, browser")].find(f => { try { return f.contentDocument?.querySelector("form#calendar-print #from-minimonth .months-forward-button"); } catch { return false; } }), 12000);
          if (!frame) return { print: false };
          const pd = frame.contentDocument; await pause(1500);
          const form = pd.querySelector("form#calendar-print"), fr = form.getBoundingClientRect();
          const out = { print: true, dark, months: ["from-minimonth", "to-minimonth"].map(idm => { const mm = pd.getElementById(idm), r = mm.getBoundingClientRect();
            const fwd = mm.querySelector(".months-forward-button"), nav = mm.querySelector(".minimonth-nav-btn:not(.today-button, .years-back-button, .years-forward-button)");
            return { right: Math.round(r.right * 10) / 10, formRight: Math.round(fr.right * 10) / 10, fwd: Math.round(fwd.getBoundingClientRect().width),
                     mask: csOf(fwd, "::before").maskImage.slice(0, 12), navBg: nav ? csOf(nav).backgroundColor : null,
                     heads: [...mm.querySelectorAll(".minimonth-month-name, .minimonth-year-name")].map(i => csOf(i).appearance) }; }) };
          const cancel = pd.querySelector('#next-button-container button[is="cancel-button"]');
          if (cancel) cancel.click();
          await pause(800);
          try { if (frame.isConnected && frame.contentDocument?.querySelector("form#calendar-print")) frame.contentWindow.close(); } catch {}
          await pause(500);
          return out;""")
        if not res.get("print"):
            return False, f"keine Druckvorschau {res}"
        def dim(c):
            import re
            v = [float(x) for x in re.findall(r"-?[\d.]+", c or "")][:3]
            lum = sum(k * ((x / 255) / 12.92 if x / 255 <= 0.03928 else ((x / 255 + 0.055) / 1.055) ** 2.4) for k, x in zip((0.2126, 0.7152, 0.0722), v)) if len(v) == 3 else 1
            return rgba_alpha(c) < 0.2 or lum < 0.3
        ok = all(mm["right"] <= mm["formRight"] + 0.5 and mm["fwd"] > 0 and mm["mask"].startswith("url(")
                 and (not res["dark"] or (mm["navBg"] and dim(mm["navBg"])))
                 and len(mm["heads"]) == 2 and all(x == "none" for x in mm["heads"]) for mm in res["months"])
        return ok, f"{res}"
    check("Drucken: Minikalender „Von“/„Bis“ im Formular, Pfeile sichtbar, Knöpfe ohne helle Fläche, Monat/Jahr ohne Feldfläche", print_minimonths, results)


    def month_views_no_scroll():
        # Monat und Mehrwochen füllen den Bereich ohne Bildlaufleiste (Zoom 1), Tage gleich hoch
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900); await pause(600); await toCalendar();
          const out = {};
          for (const v of ["month", "multiweek"]) {
            w.switchToView(v); await pause(1200);
            const view = d.getElementById(v + "-view");
            const sc = [view, ...view.querySelectorAll("*")].filter(e => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(w.getComputedStyle(e).overflowY));
            const boxes = [...view.querySelectorAll("calendar-month-day-box")].filter(vis).map(b => Math.round(b.getBoundingClientRect().height));
            const vr = view.getBoundingClientRect(), tab = d.getElementById("calendarDisplayBox").getBoundingClientRect();
            out[v] = { scrollers: sc.map(e => e.localName + "." + e.className.split(" ")[0]).slice(0, 3), days: boxes.length,
                       heights: [Math.min(...boxes), Math.max(...boxes)], fits: vr.bottom <= tab.bottom + 1 };
          }
          w.switchToView("week"); await pause(600);
          return out;""")
        ok = all(not v["scrollers"] and v["days"] >= 14 and v["heights"][1] - v["heights"][0] <= 2 and v["fits"] for v in res.values())
        return ok, f"{res}"
    check("Kalender: Monat und Mehrwochen ohne Bildlaufleiste, Tage gleich hoch, ganz im Bereich", month_views_no_scroll, results)

    def day_view_now():
        # Tagesansicht: eine Spalte über die ganze Breite, rote Jetzt-Linie wie Apple Kalender, Kopf mit dem heutigen Tag
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900); await pause(600); await toCalendar(); w.switchToView("day"); w.currentView().goToDay(cal.dtz.now()); await pause(1200);
          const view = d.getElementById("day-view");
          const dayCols = [...view.querySelectorAll("calendar-event-column")].filter(vis);
          const ind = [...view.querySelectorAll(".timeIndicator")].find(vis);
          const vr = view.getBoundingClientRect(), cr = dayCols[0]?.getBoundingClientRect();
          const out = { cols: dayCols.length, share: cr ? Math.round(cr.width / vr.width * 100) : 0,
                        line: ind ? [w.getComputedStyle(ind).borderTopColor, w.getComputedStyle(ind).borderTopStyle] : null };
          w.switchToView("week"); await pause(500);
          return out;""")
        ok = res["cols"] == 1 and res["share"] >= 70 and bool(res["line"]) and same_color(res["line"][0], "rgb(255, 59, 48)")
        return ok, f"{res}"
    check("Kalender: Tagesansicht mit einer breiten Spalte und roter Jetzt-Linie", day_view_now, results)

    def event_colors():
        # Termine in der Woche: Fläche pastellig in der Kalenderfarbe (nicht die volle Farbe), Titel gut lesbar (≥ 4,5 : 1),
        # hell und dunkel
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Farbtermin"; e.calendar = c;
          const s = cal.dtz.now(); s.hour = 11; s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          const saved = await c.addItem(e);
          try {
            await toWeek();
            const box = await till(() => [...d.querySelectorAll("#week-view calendar-event-box")].find(b => vis(b) && /Halo Farbtermin/.test(b.textContent)), 4000);
            if (!box) return { box: false };
            const cs = w.getComputedStyle(box), label = box.querySelector(".event-name-label") || box;
            return { bg: cs.backgroundColor, color: w.getComputedStyle(label).color, cal: c.getProperty("color"), dark };
          } finally { try { await c.deleteItem(saved); } catch {} }""")
        if res.get("box") is False:
            return False, "Termin nicht gefunden"
        hexcol = res["cal"] or "#000000"
        calrgb = "rgb(%d, %d, %d)" % tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
        ok = not same_color(res["bg"], calrgb, tol=20) and contrast(res["bg"], res["color"]) >= 4.5
        return ok, f"Kontrast {contrast(res['bg'], res['color']):.1f} {res}"
    check("Kalender: Termine pastellig in der Kalenderfarbe, Titel gut lesbar (≥ 4,5 : 1)", event_colors, results)

    def event_drag():
        # Termin in der Woche per Ziehen eine Stunde später: Thunderbirds Ziehen bleibt trotz eigener Gestaltung bedienbar
        prep = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Ziehtermin"; e.calendar = c;
          const s = cal.dtz.now(); s.hour = 9; s.minute = 0; s.second = 0; const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en;
          w.__mcDragItem = await c.addItem(e);
          await toWeek(); w.currentView().scrollToMinute(480); await pause(800);
          const box = await till(() => [...d.querySelectorAll("#week-view calendar-event-box")].find(b => vis(b) && /Halo Ziehtermin/.test(b.textContent)), 4000);
          if (!box) return null;
          const r = box.getBoundingClientRect();
          const hour = w.currentView().pixelsPerMinute * 60;
          return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(hour)];""")
        if not prep:
            return False, "Termin nicht gefunden"
        x, y, hour = prep
        m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0},
                   {"type": "pause", "duration": 150},
                   *[{"type": "pointerMove", "x": x, "y": y + round(hour * k / 6), "origin": "viewport", "duration": 40} for k in range(1, 7)],
                   {"type": "pause", "duration": 150}, {"type": "pointerUp", "button": 0}])
        time.sleep(1.5)
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const it = await c.getItem(w.__mcDragItem.id);
          const out = { hour: it ? it.startDate.getInTimezone(cal.dtz.defaultTimezone).hour : null, minute: it?.startDate.minute };
          try { await c.deleteItem(it); } catch {}
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          return out;""")
        return res.get("hour") == 10, f"{res}"
    check("Kalender: Termin in der Woche per Ziehen verschieben (9 → 10 Uhr)", event_drag, results)

    def agenda_soon():
        # Today-Pane: laufender Termin mit „now“ statt Uhrzeit, bald beginnender (in 40 Min.) mit rotem Hinweis darunter
        res = m.js(CAL_CHECK_JS + r"""
          const c = testCalendar(); const added = [];
          const mk = async (title, startMin, durMin) => { const e = new CalEvent(); e.title = title; e.calendar = c;
            const s = cal.dtz.now(); s.second = 0; s.minute += startMin; const en = s.clone(); en.minute += durMin; e.startDate = s; e.endDate = en; added.push(await c.addItem(e)); };
          try {
            await mk("Halo Laeuft", -10, 60); await mk("Halo Gleich", 40, 30);
            await toMail(); if (!w.TodayPane?.isVisible) d.getElementById("calendar_toggle_todaypane_command").doCommand();
            await pause(2000);
            const li = t => [...d.querySelectorAll("#agenda > li.agenda-listitem")].find(x => vis(x) && x.textContent.includes(t));
            const rel = x => { const r = x?.querySelector(".agenda-listitem-relative"); return r && vis(r) ? [r.textContent.trim(), w.getComputedStyle(r).color] : null; };
            const now = li("Halo Laeuft"), soon = li("Halo Gleich");
            return { now: rel(now), nowTime: now ? vis(now.querySelector(".agenda-listitem-time")) : null, soon: rel(soon), dark };
          } finally { for (const it of added) try { await c.deleteItem(it); } catch {} }""")
        red = "rgb(255, 105, 97)" if res.get("dark") else "rgb(255, 59, 48)"
        ok = (bool(res.get("now")) and res["nowTime"] is False and same_color(res["now"][1], red)
              and bool(res.get("soon")) and any(ch.isdigit() for ch in res["soon"][0]) and same_color(res["soon"][1], red))
        return ok, f"{res}"
    check("Today-Pane: laufender Termin „now“ statt Uhrzeit, bald beginnender mit rotem Hinweis", agenda_soon, results)

def rgba_alpha(c):
    """Deckkraft aus rgb()/rgba()/color(srgb …) – 1, wenn keine angegeben ist."""
    import re
    v = re.findall(r"-?[\d.]+(?:e-?\d+)?", c or "")
    return float(v[3]) if len(v) > 3 else 1.0


def luminance(c):
    """Relative Luminanz (WCAG) aus rgb()/rgba()/color(srgb …)."""
    import re
    v = [float(x) for x in re.findall(r"-?[\d.]+(?:e-?\d+)?", c or "")][:3]
    if len(v) < 3:
        return 0.0
    k = 1 if (c or "").startswith("color(") else 255
    lin = lambda x: x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    return sum(f * lin(x / k) for f, x in zip((0.2126, 0.7152, 0.0722), v))


def contrast(a, b):
    """Kontrastverhältnis (WCAG) zweier Farben."""
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def same_color(a, b, tol=2):
    """Gleiche Farbe (rgb() und color(srgb …) gleichwertig), Abweichung höchstens tol je Kanal."""
    import re
    def norm(c):
        v = [float(x) for x in re.findall(r"-?[\d.]+(?:e-?\d+)?", c or "")]
        k = 255 if (c or "").startswith("color(") else 1
        return [x * k for x in v[:3]] + [v[3] if len(v) > 3 else 1.0]
    x, y = norm(a), norm(b)
    return len(x) == 4 and len(y) == 4 and all(abs(p - q) <= (0.02 if i == 3 else tol) for i, (p, q) in enumerate(zip(x, y)))


SCREEN_W = 99999


SERVER_ACCOUNT_JS = r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const existing = MailServices.accounts.accounts.find(a => a.incomingServer?.hostName == "127.0.0.1" && a.incomingServer.port == %(imap)d);
  if (existing) return existing.key;
  // wie der Konto-Assistent: „Lokale Ordner“ mit Postausgang gehören dazu (ohne sie sendet Thunderbird nicht im Hintergrund)
  try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
  const server = MailServices.accounts.createIncomingServer("halo", "127.0.0.1", "imap");
  server.port = %(imap)d;
  server.socketType = Ci.nsMsgSocketType.plain;
  server.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  server.password = "halo-test";
  server.prettyName = "Halo Testkonto";
  const outgoing = MailServices.outgoingServer || MailServices.smtp;
  const smtp = outgoing.createServer("smtp");
  const sm = smtp.QueryInterface ? smtp.QueryInterface(Ci.nsISmtpServer) : smtp;
  sm.hostname = "127.0.0.1"; sm.port = %(smtp)d; smtp.authMethod = Ci.nsMsgAuthMethod.none; smtp.socketType = Ci.nsMsgSocketType.plain;
  const id = MailServices.accounts.createIdentity();
  id.email = "halo@example.invalid"; id.fullName = "Halo Test"; id.smtpServerKey = smtp.key;
  const account = MailServices.accounts.createAccount();
  account.addIdentity(id); account.incomingServer = server;
  return account.key;"""


def server_checks(m, results):
    """Konto mit lokalem Server (tests/testserver.py, nur 127.0.0.1): IMAP-Ordner und Abrufen, Senden über SMTP,
    Fehler beim Senden, Abonnieren-Dialog, falsches Passwort – Oberflächen, die ohne Konto nie erscheinen.
    Läuft am Ende, damit das Konto die übrigen Prüfungen nicht verändert."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from testserver import MailServers
    servers = MailServers()
    servers.imap.add("INBOX", "From: Anna Beispiel <anna@example.invalid>\nTo: Halo Test <halo@example.invalid>\nSubject: Willkommen im Testkonto\n"
                     "Date: Sat, 24 Oct 2026 09:00:00 +0200\nMessage-ID: <srv-1@example.invalid>\n\nErste Mail vom Testserver.\n")
    try:
        key = m.js(SERVER_ACCOUNT_JS % {"imap": servers.imap_port, "smtp": servers.smtp_port})

        def account_folders():
            # Konto erscheint in der Ordnerliste mit seinen Ordnern, die Mail im Posteingang kommt an
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s"), root = acc.incomingServer.rootFolder;
              const a3 = await toMail();
              const inbox = await until(() => root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox), 10000);
              a3.displayFolder(inbox.URI);
              await until(() => a3.gDBView?.rowCount > 0, 15000);
              return { folders: root.subFolders.map(f => f.name).sort(), rows: a3.gDBView?.rowCount || 0,
                       subject: a3.gDBView?.rowCount ? a3.gDBView.getMsgHdrAt(0).mime2DecodedSubject : null,
                       inTree: !!a3.document.querySelector(`#folderTree li[data-server-key="${acc.incomingServer.key}"], #folderTree li[data-folder-uri^="${root.URI}"]`) };""" % key)
            ok = res["rows"] >= 1 and res["subject"] == "Willkommen im Testkonto" and "Sent" in str(res["folders"]) and res["inTree"]
            return ok, f"{res}"
        check("Testkonto: IMAP-Ordner in der Ordnerliste, Mail im Posteingang", account_folders, results)

        def get_new():
            # neue Mail auf dem Server → „Abrufen“ in der Toolbar holt sie; das Menü am Knopf ist im halo-Stil
            servers.imap.add("INBOX", "From: Ben <ben@example.invalid>\nTo: Halo Test <halo@example.invalid>\nSubject: Nachzuegler\n"
                             "Date: Sat, 24 Oct 2026 10:00:00 +0200\nMessage-ID: <srv-2@example.invalid>\n\nZweite Mail.\n")
            res = m.js(r"""
              const a3 = await toMail();
              const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="get-messages"]')].find(l => l.getBoundingClientRect().width);
              const btn = li?.querySelector("button");
              btn?.click();
              const found = await until(() => { for (let i = 0; i < (a3.gDBView?.rowCount || 0); i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "Nachzuegler") return true; return false; }, 15000);
              return { button: !!btn, found, folder: a3.gFolder?.URI, rows: a3.gDBView?.rowCount };""")
            return res["button"] and res["found"], f"{res} IMAP: {servers.imap.log[-8:]}"
        check("Testkonto: „Abrufen“ holt neue Mail vom Server", get_new, results)

        def send_smtp():
            # Verfassen und Senden: Fenster schließt sofort, die Mail kommt beim SMTP-Server an
            before = len(servers.smtp.sent)
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s");
              const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
              const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
              Services.prefs.setIntPref("extensions.mailcards.undoSend", 0);
              fields.to = "ziel@example.invalid"; fields.subject = "Halo Sendeprobe"; fields.body = "Hallo vom Test.";
              params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText; params.composeFields = fields; params.identity = acc.defaultIdentity;
              MailServices.compose.OpenComposeWindowWithParams(null, params);
              const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
              await wait(1500);
              cw.goDoCommand("cmd_sendNow");
              const closed = await until(() => cw.closed, 10000);
              return { closed: !!closed };""" % key)
            for _ in range(40):
                if len(servers.smtp.sent) > before:
                    break
                time.sleep(0.5)
            got = servers.smtp.sent[before:] if len(servers.smtp.sent) > before else []
            ok = res["closed"] and len(got) == 1 and "Halo Sendeprobe" in got[0][2] and "ziel@example.invalid" in got[0][1][0]
            return ok, f"{res} gesendet: {[(g[0], g[1]) for g in got]}"
        check("Testkonto: Senden über SMTP – Fenster schließt, Mail kommt beim Server an", send_smtp, results)

        def undo_send():
            # Senden rückgängig: Fenster verschwindet sofort, unten „Senden rückgängig“, nichts geht hinaus; rückgängig →
            # Fenster wieder da; erneut senden → nach der Wartezeit beim Server, Fenster zu (Wartezeit hier 2 s)
            before = len(servers.smtp.sent)
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s");
              Services.prefs.setIntPref("extensions.mailcards.undoSend", 6);
              const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
              const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
              fields.to = "ziel@example.invalid"; fields.subject = "Halo Rueckholprobe"; fields.body = "Noch nicht senden.";
              params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText; params.composeFields = fields; params.identity = acc.defaultIdentity;
              MailServices.compose.OpenComposeWindowWithParams(null, params);
              const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
              await wait(1500);
              const visible = () => !cw.document.hidden;
              const out = { types: [], errs: [] };
              cw.addEventListener("compose-send-message", e => out.types.push([e.detail?.msgType, e.defaultPrevented]), false);
              const cl = { observe: m => { if (m instanceof Ci.nsIScriptError && m.flags == 0) out.errs.push(m.errorMessage.slice(0, 160)); } };
              Services.console.registerListener(cl);
              cw.goDoCommand("cmd_sendNow");
              const bar = await until(() => d.getElementById("mcUndoSend"), 4000);
              // (Windows und Linux ohne Fenstermanager melden das versteckte Fenster nicht – nur kurz warten)
              await until(() => cw.document.hidden, 1200);
              out.held = { visible: visible(), closed: cw.closed, bar: bar?.textContent };
              Services.console.unregisterListener(cl); out.errs = out.errs.filter(e => !/editorContent|security/i.test(e)).slice(0, 6);
              bar?.querySelector(".mc-us-undo").click(); await until(() => !cw.document.hidden, 2000);
              out.undone = { visible: visible(), closed: cw.closed, bar: !!d.getElementById("mcUndoSend") };
              w.__mcUndoWin = cw;
              return out;""" % key)
            time.sleep(7)
            after_undo = len(servers.smtp.sent) - before
            res2 = m.js(r"""
              const cw = w.__mcUndoWin; delete w.__mcUndoWin;
              cw.goDoCommand("cmd_sendNow");
              const closed = await until(() => cw.closed, 20000);
              Services.prefs.clearUserPref("extensions.mailcards.undoSend");
              return { closed: !!closed, bar: !!d.getElementById("mcUndoSend") };""")
            for _ in range(20):
                if len(servers.smtp.sent) > before:
                    break
                time.sleep(0.5)
            got = [g for g in servers.smtp.sent[before:] if "Halo Rueckholprobe" in g[2]]
            h, u = res.get("held") or {}, res.get("undone") or {}
            ok = ((h.get("visible") is False or sys.platform != "darwin") and not h.get("closed") and "Undo Send" in (h.get("bar") or "")
                  and u == {"visible": True, "closed": False, "bar": False} and after_undo == 0
                  and res2["closed"] and not res2["bar"] and len(got) == 1)
            return ok, f"{res} nach Rückgängig gesendet: {after_undo} {res2} danach gesendet: {len(got)}"
        check("Testkonto: Senden rückgängig – Fenster weg, Hinweis unten, rückgängig holt es zurück, danach gesendet", undo_send, results)

        def quick_reply():
            # Schnellantwort unter der Mail: Feld „Reply to Anna Beispiel …“, Text + ⌘↩ sendet ohne Fenster an den Absender,
            # Betreff „Re: …“ mit In-Reply-To, die Mail gilt danach als beantwortet; Entwürfe ohne Feld
            before = len(servers.smtp.sent)
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s"), root = acc.incomingServer.rootFolder;
              const inbox = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
              const a3 = await toMail(); a3.displayFolder(inbox.URI); await until(() => a3.gDBView?.rowCount > 0, 10000);
              let i = 0; for (; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "Willkommen im Testkonto") break;
              a3.threadTree.selectedIndex = i; await wait(1500);
              const md = a3.messageBrowser.contentDocument;
              const bar = await until(() => md.getElementById("mcQuickReply"), 5000);
              if (!bar) return { bar: false };
              const field = bar.querySelector(".mc-qr-field");
              const out = { placeholder: field.placeholder, sendHidden: md.defaultView.getComputedStyle(bar.querySelector(".mc-qr-send")).display };
              field.value = "Danke, angekommen!"; field.dispatchEvent(new md.defaultView.Event("input", { bubbles: true }));
              out.sendShown = md.defaultView.getComputedStyle(bar.querySelector(".mc-qr-send")).display;
              field.dispatchEvent(new md.defaultView.KeyboardEvent("keydown", { key: "Enter", metaKey: true, ctrlKey: true, bubbles: true }));
              const hdr = a3.gDBView.getMsgHdrAt(i);
              out.replied = !!(await until(() => hdr.flags & Ci.nsMsgMessageFlags.Replied, 15000));
              out.after = { value: field.value, placeholder: field.placeholder };
              // Entwurf: kein Feld
              const drafts = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
              a3.displayFolder(drafts.URI); await wait(1200);
              out.inDrafts = a3.gDBView.rowCount ? "?" : "leer";
              a3.displayFolder(inbox.URI); await wait(800);
              return out;""" % key)
            for _ in range(30):
                if len(servers.smtp.sent) > before:
                    break
                time.sleep(0.5)
            got = servers.smtp.sent[before:]
            data = got[0][2] if got else ""
            ok = (res.get("placeholder") == "Reply to Anna Beispiel …" and res.get("sendHidden") == "none" and res.get("sendShown") != "none"
                  and res.get("replied") and res.get("after", {}).get("value") == "" and len(got) == 1
                  and "anna@example.invalid" in got[0][1][0] and "Subject: Re: Willkommen im Testkonto" in data
                  and "In-Reply-To: <srv-1@example.invalid>" in data and "Danke, angekommen!" in data)
            return ok, f"{res} gesendet: {[(g[1], g[2][:300]) for g in got]}"
        check("Testkonto: Schnellantwort unter der Mail sendet ohne Fenster an den Absender, Mail gilt als beantwortet", quick_reply, results)

        def send_later():
            # Später senden: Pfeil neben „Senden“ mit „Morgen …“ und „Später senden …“; geplante Mail liegt als Entwurf mit
            # X-Halo-Send-At, wird zur Zeit in den Postausgang geschoben und gesendet (Zeit hier: in 3 s)
            before = len(servers.smtp.sent)
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const SL = Cu.evalInSandbox("SendLater", g);
              const acc = MailServices.accounts.getAccount("%s");
              Services.prefs.setIntPref("extensions.mailcards.undoSend", 0);
              const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
              const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
              fields.to = "ziel@example.invalid"; fields.subject = "Halo Spaeter"; fields.body = "Kommt gleich.";
              params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText; params.composeFields = fields; params.identity = acc.defaultIdentity;
              MailServices.compose.OpenComposeWindowWithParams(null, params);
              const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
              await wait(1500);
              const btn = cw.document.getElementById("mcSendLater"), popup = cw.document.getElementById("mcSendLaterPopup");
              const out = { button: !!btn && btn.getBoundingClientRect().width > 0 };
              popup.dispatchEvent(new cw.Event("popupshowing"));
              out.menu = [...popup.querySelectorAll("menuitem")].map(i => i.getAttribute("label"));
              SL.schedule(cw, new Date(Date.now() + 3000));
              out.closed = !!(await until(() => cw.closed, 10000));
              const drafts = await acc.defaultIdentity.getOrCreateDraftsFolderAsync();
              out.draftsFolder = drafts?.prettyName;
              await wait(500);
              let found = null;
              for (let t = 0; t < 30 && !found; t++) { try { drafts.updateFolder(null); } catch {}; await wait(300);
                found = [...drafts.msgDatabase.enumerateMessages()].find(h => h.mime2DecodedSubject == "Halo Spaeter"); }
              out.draft = found ? { at: !!Number(found.getStringProperty("x-halo-send-at")) } : null;
              await wait(3500);
              await SL.check(true);
              Services.prefs.clearUserPref("extensions.mailcards.undoSend");
              return out;""" % (ADDON_ID, key))
            for _ in range(40):
                if any("Halo Spaeter" in g[2] for g in servers.smtp.sent[before:]):
                    break
                time.sleep(0.5)
            got = [g for g in servers.smtp.sent[before:] if "Halo Spaeter" in g[2]]
            ok = (res.get("button") and len(res.get("menu", [])) >= 3 and res["menu"][0] == "Send Now" and res["menu"][-1] == "Send Later …"
                  and res.get("closed") and res.get("draft") == {"at": True} and len(got) == 1)
            return ok, f"{res} gesendet: {len(got)}"
        check("Testkonto: Später senden – Menü am Senden-Knopf, geplante Mail als Entwurf, zur Zeit gesendet", send_later, results)

        def send_later_place():
            # „Später senden“ als kleiner Pfeil gleich rechts neben dem runden Senden-Knopf (war eine leere Kapsel links)
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s");
              const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
              const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
              fields.to = "ziel@example.invalid"; fields.subject = "Halo Pfeilprobe";
              params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.HTML; params.composeFields = fields; params.identity = acc.defaultIdentity;
              MailServices.compose.OpenComposeWindowWithParams(null, params);
              const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
              await wait(1500);
              const r = id => { const b = cw.document.getElementById(id)?.getBoundingClientRect(); return b ? { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), t: Math.round(b.top), b: Math.round(b.bottom) } : null; };
              const later = cw.document.getElementById("mcSendLater");
              const out = { send: r("button-send"), later: r("mcSendLater"), mask: later ? cw.getComputedStyle(later).maskImage.includes("resource://mailcards/icons/send-later.svg") : false, win: cw.innerWidth };
              cw.gMsgCompose.compFields.subject = ""; cw.close(); await wait(500);
              for (const x of [...Services.wm.getEnumerator("msgcompose")]) x.close();
              return out;""" % key)
            sd, lt = res.get("send") or {}, res.get("later") or {}
            ok = (sd and lt and res.get("mask") and 0 <= lt["l"] - sd["r"] <= 6 and lt["w"] <= 20 and res["win"] - lt["r"] <= 20
                  and abs((lt["t"] + lt["b"]) - (sd["t"] + sd["b"])) <= 2)
            return ok, f"{res}"
        check("Verfassen: „Später senden“ als kleiner Pfeil direkt rechts neben dem Senden-Knopf", send_later_place, results)

        def remind_me():
            # Erinnern: Kontextmenü „Remind Me“ mit Zeiten; die Mail wandert in den Ordner „Remind Me“ des Kontos und kommt
            # zur Zeit ungelesen in den Posteingang zurück (Zeit hier: in 2 s)
            servers.imap.add("INBOX", "From: Clara <clara@example.invalid>\nTo: Halo Test <halo@example.invalid>\nSubject: Bitte morgen ansehen\n"
                             "Date: Sat, 24 Oct 2026 11:00:00 +0200\nMessage-ID: <srv-remind@example.invalid>\n\nErinnerungsprobe.\n", flags=["\\Seen"])
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const R = Cu.evalInSandbox("Remind", g);
              const acc = MailServices.accounts.getAccount("%s"), root = acc.incomingServer.rootFolder;
              const inbox = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
              const a3 = await toMail(); a3.displayFolder(inbox.URI);
              const find = () => { for (let i = 0; i < (a3.gDBView?.rowCount || 0); i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "Bitte morgen ansehen") return i; return -1; };
              await until(() => { inbox.updateFolder(a3.msgWindow); return find() >= 0; }, 15000);
              a3.threadTree.selectedIndex = find(); await wait(800);
              const popup = a3.document.getElementById("mailContext");
              popup.dispatchEvent(new a3.Event("popupshowing"));
              const menu = a3.document.getElementById("mcRemindMenu");
              const out = { menu: !!menu && !menu.hidden };
              const inner = menu?.menupopup || menu?.querySelector("menupopup");
              inner?.dispatchEvent(new a3.Event("popupshowing"));
              out.items = inner ? inner.querySelectorAll("menuitem").length : 0;
              const hdr = a3.gDBView.getMsgHdrAt(find());
              await R.remind([hdr], new Date(Date.now() + 2000));
              const box = await until(() => root.containsChildNamed("Remind Me") && root.getChildNamed("Remind Me"), 8000);
              out.moved = !!(await until(() => { try { box.updateFolder(null); } catch {} return box?.msgDatabase?.getMsgHdrForMessageID("srv-remind@example.invalid"); }, 10000));
              out.gone = find() < 0;
              await wait(2500);
              await R.check();
              const back = await until(() => { inbox.updateFolder(a3.msgWindow); return inbox.msgDatabase.getMsgHdrForMessageID("srv-remind@example.invalid"); }, 15000);
              out.back = !!back; out.unread = back ? !back.isRead : null;
              out.left = R.list().length;
              return out;""" % (ADDON_ID, key))
            ok = res.get("menu") and res.get("items", 0) >= 3 and res.get("moved") and res.get("back") and res.get("unread") and res.get("left") == 0
            return ok, f"{res}"
        check("Testkonto: Erinnern – Mail in „Remind Me“, kommt zur Zeit ungelesen zurück", remind_me, results)

        def follow_up():
            # Nachfassen: eigene Mail von vor 5 Tagen ohne Antwort → Hinweis über dem Posteingang mit „Follow Up“; ✕ blendet aus
            five = time.strftime("%a, %d %b %Y 09:00:00 +0000", time.gmtime(time.time() - 5 * 86400))
            servers.imap.add("Sent", f"From: Halo Test <halo@example.invalid>\nTo: Kunde <kunde@example.invalid>\nSubject: Angebot Fenster\n"
                             f"Date: {five}\nMessage-ID: <srv-follow@example.invalid>\n\nWie besprochen.\n", flags=["\\Seen"])
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const FU = Cu.evalInSandbox("FollowUp", g);
              const acc = MailServices.accounts.getAccount("%s"), root = acc.incomingServer.rootFolder;
              const sent = root.getFolderWithFlags(Ci.nsMsgFolderFlags.SentMail), inbox = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
              const a3 = await toMail();
              a3.displayFolder(sent.URI);
              await until(() => { sent.updateFolder(a3.msgWindow); return sent.msgDatabase.getMsgHdrForMessageID("srv-follow@example.invalid"); }, 15000);
              FU.cache = null;
              a3.displayFolder(inbox.URI); await wait(1200);
              const bar = await until(() => a3.document.getElementById("mcFollowUp"), 5000);
              const out = { bar: bar?.textContent || null };
              bar?.querySelector(".mc-fu-close").click(); await wait(300);
              out.afterDismiss = !!a3.document.getElementById("mcFollowUp") && a3.document.getElementById("mcFollowUp").textContent.includes("Angebot Fenster");
              Services.prefs.clearUserPref("extensions.mailcards.followUpDismissed"); FU.cache = null;
              return out;""" % (ADDON_ID, key))
            ok = "Angebot Fenster" in (res.get("bar") or "") and "Follow Up" in (res.get("bar") or "") and not res.get("afterDismiss")
            return ok, f"{res}"
        check("Testkonto: Nachfassen – Hinweis über dem Posteingang zu eigener Mail ohne Antwort, ✕ blendet aus", follow_up, results)

        def subscribe_dialog():
            # Abonnieren-Dialog (nur mit IMAP-Konto): öffnet, zeigt den nicht abonnierten Ordner „Projekte“, ohne harte Rahmen
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s");
              const a3 = await toMail();
              w.openDialog("chrome://messenger/content/subscribe.xhtml", "_blank", "chrome,modal=no,titlebar,resizable=yes",
                { folder: acc.incomingServer.rootFolder, okCallback() {} });
              const dw = await until(() => [...Services.wm.getEnumerator(null)].find(x => /subscribe\.xhtml/.test(x.location.href) && x.document.readyState == "complete"), 8000);
              if (!dw) return { open: false };
              const rows = await until(() => { const t = dw.document.getElementById("subscribeTree");
                const names = [...(t?.querySelectorAll("tr[id^='subscribeTree-row']") || [])].map(r => r.textContent.trim()); return names.includes("Projekte") && names; }, 10000);
              const tree = dw.document.getElementById("subscribeTree");
              const out = { open: true, rows: rows || [], border: tree ? dw.getComputedStyle(tree).borderTopColor : null, bw: tree ? dw.getComputedStyle(tree).borderTopWidth : null };
              dw.close();
              return out;""" % key)
            ok = res.get("open") and "Projekte" in res.get("rows", []) and float((res.get("bw") or "0px")[:-2]) <= 1
            return ok, f"{res}"
        check("Testkonto: Abonnieren-Dialog zeigt die Ordner des Servers, ohne harten Rahmen", subscribe_dialog, results)

        def send_error():
            # Server lehnt ab → halo.spaces meldet den Fehler als Dialog mit „Postausgang zeigen“ (statt nur in der
            # Aktivitätsanzeige). Der Dialog selbst unterbräche Marionette – mitgeschnitten wird sein Aufruf. (Unter Windows
            # zeigt Thunderbird zusätzlich eigene Meldungen – die werden geschlossen)
            servers.smtp.fail_next = 1
            m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const enh = Cu.evalInSandbox("enhancer", g);
              w.__mcErrCalls = []; w.__mcErrOrig = enh.showSendError;
              enh.showSendError = async (hdr, message) => { w.__mcErrCalls.push({ subject: hdr?.mime2DecodedSubject || null }); };
              const acc = MailServices.accounts.getAccount("%s");
              Services.prefs.setIntPref("extensions.mailcards.undoSend", 0);
              const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
              const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
              fields.to = "ziel@example.invalid"; fields.subject = "Halo Fehlerprobe"; fields.body = "Wird abgelehnt.";
              params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText; params.composeFields = fields; params.identity = acc.defaultIdentity;
              MailServices.compose.OpenComposeWindowWithParams(null, params);
              const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
              await wait(1500); cw.goDoCommand("cmd_sendNow");
              return 1;""" % (ADDON_ID, key))
            res = None
            for _ in range(20):
                time.sleep(1)
                try:
                    m.cmd("WebDriver:DismissAlert", {})
                except Exception:
                    pass
                try:
                    res = m.js(r"""
                      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
                      const outbox = MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
                      return { calls: w.__mcErrCalls || [], kept: outbox?.getTotalMessages(false) || 0 };""")
                except Exception:
                    res = None
                if res and res.get("calls"):
                    break
            m.js(r"""
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const enh = Cu.evalInSandbox("enhancer", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
              if (w.__mcErrOrig) enh.showSendError = w.__mcErrOrig; delete w.__mcErrOrig;
              Services.prefs.clearUserPref("extensions.mailcards.undoSend");
              for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
              return 1;""" % ADDON_ID)
            res = res or {}
            c = (res.get("calls") or [{}])[0]
            ok = c.get("subject") == "Halo Fehlerprobe" and res.get("kept", 0) >= 1
            # Postausgang wieder leeren (die abgelehnte Mail bliebe sonst für die folgenden Prüfungen liegen)
            m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const outbox = MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
              const hdrs = outbox ? [...outbox.msgDatabase.enumerateMessages()] : [];
              if (hdrs.length) outbox.deleteMessages(hdrs, null, true, false, null, false);
              return 1;""")
            return ok, f"{res}"
        check("Testkonto: abgelehnte Mail → Fehler-Dialog (mit „Postausgang zeigen“), Mail bleibt im Postausgang", send_error, results)

        def chat_irc():
            # Chat mit dem IRC-Testserver: anmelden, Raum betreten, Gespräch in der Liste ausgewählt (Akzentfarbe),
            # Nachricht einer erfundenen Person erscheint, eigene Nachricht kommt beim Server an
            res = m.js(r"""
              const { IMServices } = ChromeUtils.importESModule("resource:///modules/IMServices.sys.mjs");
              tm.openTab("chat", {}); await wait(2000);
              const acc = IMServices.accounts.createAccount("halo@127.0.0.1", "prpl-irc");
              acc.setInt("port", %d); acc.setBool("ssl", false); acc.alias = "Halo Testchat";
              acc.connect();
              const out = { connected: !!(await until(() => acc.connected, 15000)) };
              const fields = acc.getChatRoomDefaultFieldValues(); fields.setValue("channel", "#halo");
              acc.joinChat(fields);
              const conv = await until(() => IMServices.conversations.getConversations().find(c => c.name == "#halo"), 10000);
              const listbox = d.getElementById("contactlistbox");
              const it = await until(() => [...listbox.querySelectorAll("richlistitem")].find(i => i.getAttribute("displayname") == "#halo" || i.textContent.includes("#halo")), 8000);
              if (it) listbox.selectedItem = it;
              await wait(1500);
              out.item = it ? { bg: w.getComputedStyle(it).backgroundColor, accent: w.getComputedStyle(d.documentElement).getPropertyValue("--mt-accent").trim() } : null;
              conv?.sendMsg("Hallo zurück");
              w.__mcChatAcc = acc.id;
              return out;""" % servers.irc_port)
            time.sleep(2)
            servers.irc.say("#halo", "anna", "Hallo aus dem Testchat")
            res2 = m.js(r"""
              const { IMServices } = ChromeUtils.importESModule("resource:///modules/IMServices.sys.mjs");
              const cb = [...d.querySelectorAll("browser")].find(b => b.currentURI?.spec == "chrome://chat/content/conv.html" && b.getBoundingClientRect().width > 100);
              const texts = () => [...(cb?.contentDocument?.querySelectorAll(".message, .msg") || [])].map(e => e.textContent);
              const got = await until(() => texts().some(t => t.includes("Hallo aus dem Testchat")), 10000);
              const out = { shown: !!got, own: texts().some(t => t.includes("Hallo zurück")) };
              const acc = IMServices.accounts.getAccountById(w.__mcChatAcc); delete w.__mcChatAcc;
              try { acc.disconnect(); await wait(500); IMServices.accounts.deleteAccount(acc.id); } catch {}
              await toMail();
              for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
              return out;""")
            it = res.get("item") or {}
            ok = (res.get("connected") and it and it.get("bg") not in ("", "transparent", "rgba(0, 0, 0, 0)")
                  and res2.get("shown") and res2.get("own") and ("#halo", "Hallo zurück") in servers.irc.said)
            return ok, f"{res} {res2} IRC: {servers.irc.log[:8]}"
        check("Testkonto: Chat mit Testserver – anmelden, Raum betreten, Gespräch ausgewählt, Nachrichten hin und zurück", chat_irc, results)

        def wrong_password():
            # Server lehnt die Anmeldung ab → Thunderbirds Nachfrage erscheint als Kachel im Fenster (wie ein macOS-Sheet)
            servers.imap.fail_login = True
            res = m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const acc = MailServices.accounts.getAccount("%s"), server = acc.incomingServer;
              await toMail();
              const host = d.getElementById("mcDialogBox");
              const out = { host: !!host, seen: null, count: 0 };
              // jede Nachfrage messen und abbrechen (Marionette bräche sie sonst beim nächsten Befehl selbst ab)
              const onOpen = () => {
                out.count++;
                w.setTimeout(() => {
                  const card = host?.querySelector(".dialogBox"), f = host?.querySelector(".dialogFrame");
                  out.seen ||= { open: !!host?.open, radius: card ? w.getComputedStyle(card).borderTopLeftRadius : null,
                                 text: (f?.contentDocument?.getElementById("infoBody")?.textContent || "").slice(0, 120) };
                  f?.contentDocument?.querySelector("dialog")?.cancelDialog();
                }, 900);
              };
              w.addEventListener("dialogopen", onOpen, true);
              w.__mcPwOff = () => w.removeEventListener("dialogopen", onOpen, true);
              server.closeCachedConnections(); await wait(500);
              const inbox = server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
              w.setTimeout(() => inbox.getNewMessages(w.msgWindow, null), 100);
              w.__mcPwTest = out;
              return 1;""" % key)
            time.sleep(8)
            res = m.js(r"""
              const out = w.__mcPwTest || {}; delete w.__mcPwTest;
              w.__mcPwOff?.(); delete w.__mcPwOff;
              const host = d.getElementById("mcDialogBox");
              await until(() => !host?.open, 3000);
              out.closed = !host?.open;
              return out;""")
            servers.imap.fail_login = False
            s_ = res.get("seen") or {}
            ok = res.get("host") and s_.get("open") and s_.get("radius") == "14px" and res.get("closed")
            return ok, f"{res}"
        check("Testkonto: falsches Passwort – Nachfrage als Kachel im Fenster, Abbrechen schließt sie", wrong_password, results)

        def openpgp_roundtrip():
            # OpenPGP mit erfundenem Schlüssel: Verfassen mit Verschlüsselung (Knopf aktiv), Mail an sich selbst über den
            # Testserver, zurück in den Posteingang → Leseansicht entschlüsselt sie und zeigt den Hinweis im Mailkopf
            m.cmd("WebDriver:SetTimeouts", {"script": 120000})
            try:
                before = len(servers.smtp.sent)
                res = m.js(r"""
                  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
                  const { RNP } = ChromeUtils.importESModule("chrome://openpgp/content/modules/RNP.sys.mjs");
                  const { EnigmailKeyRing } = ChromeUtils.importESModule("chrome://openpgp/content/modules/keyRing.sys.mjs");
                  const { PgpSqliteDb2 } = ChromeUtils.importESModule("chrome://openpgp/content/modules/sqliteDb.sys.mjs");
                  const acc = MailServices.accounts.getAccount("%s"), id = acc.defaultIdentity;
                  await RNP.init();
                  const keyId = await RNP.genKey("Halo Test <halo@example.invalid>", "ECC", 0, 30, "");
                  EnigmailKeyRing.clearCache();
                  const key = EnigmailKeyRing.getKeyById(keyId);
                  await PgpSqliteDb2.acceptAsPersonalKey(key.fpr);
                  id.setUnicharAttribute("openpgp_key_id", key.keyId);
                  id.setIntAttribute("encryptionpolicy", 2);
                  Services.prefs.setIntPref("extensions.mailcards.undoSend", 0);
                  const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
                  const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
                  fields.to = "Halo Test <halo@example.invalid>"; fields.subject = "Halo geheim"; fields.body = "Nur für mich lesbar.";
                  params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText; params.composeFields = fields; params.identity = id;
                  MailServices.compose.OpenComposeWindowWithParams(null, params);
                  const cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.readyState == "complete" && x.gMsgCompose), 10000);
                  await wait(2500);
                  const btn = cw.document.getElementById("button-encryption");
                  const out = { key: !!key, encrypt: !!cw.gSendEncrypted, btn: btn ? { checked: btn.checked || btn.getAttribute("checked") == "true", shown: btn.getBoundingClientRect().width > 0 } : null };
                  const bmp = await cw.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white");
                  const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
                  const blob = await new Promise(r => c.toBlob(r)); await IOUtils.write(PathUtils.join(PathUtils.tempDir, "halo-pgp-compose.png"), new Uint8Array(await blob.arrayBuffer()));
                  cw.goDoCommand("cmd_sendNow");
                  out.closed = !!(await until(() => cw.closed, 20000));
                  return out;""" % key)
                for _ in range(40):
                    if len(servers.smtp.sent) > before:
                        break
                    time.sleep(0.5)
                raw = servers.smtp.sent[-1][2] if len(servers.smtp.sent) > before else ""
                encrypted = "BEGIN PGP MESSAGE" in raw or "application/pgp-encrypted" in raw
                if raw:
                    servers.imap.add("INBOX", raw)
                res2 = m.js(r"""
                  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
                  const acc = MailServices.accounts.getAccount("%s"), inbox = acc.incomingServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
                  const a3 = await toMail(); a3.displayFolder(inbox.URI);
                  inbox.getNewMessages(w.msgWindow, null);
                  const idx = await until(() => { for (let i = 0; i < (a3.gDBView?.rowCount || 0); i++) if (a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject.includes("geheim") || a3.gDBView.getMsgHdrAt(i).mime2DecodedSubject == "...") return i + 1; return 0; }, 15000);
                  if (!idx) return { found: false };
                  a3.threadTree.selectedIndex = idx - 1; await wait(4000);
                  const mb = a3.messageBrowser?.contentDocument || a3.document.getElementById("messageBrowser")?.contentDocument;
                  const body = mb?.getElementById("messagepane")?.contentDocument?.body?.textContent || "";
                  const tech = mb?.getElementById("encryptionTechBtn");
                  const out = { found: true, body: body.includes("Nur für mich lesbar."), tech: tech ? { shown: tech.getBoundingClientRect().width > 0, text: tech.textContent.trim() } : null };
                  const bmp = await w.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white");
                  const c = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
                  const blob = await new Promise(r => c.toBlob(r)); await IOUtils.write(PathUtils.join(PathUtils.tempDir, "halo-pgp-read.png"), new Uint8Array(await blob.arrayBuffer()));
                  Services.prefs.clearUserPref("extensions.mailcards.undoSend");
                  return out;""" % key)
            finally:
                m.cmd("WebDriver:SetTimeouts", {"script": 30000})
            t_ = res2.get("tech") or {}
            ok = (res.get("key") and res.get("encrypt") and (res.get("btn") or {}).get("checked") and res.get("closed") and encrypted
                  and res2.get("found") and res2.get("body") and t_.get("shown"))
            return ok, f"{res} verschlüsselt: {encrypted} {res2}"
        check("Testkonto: OpenPGP – Verfassen verschlüsselt mit Testschlüssel, Mail kommt verschlüsselt an, Leseansicht entschlüsselt mit Hinweis im Mailkopf", openpgp_roundtrip, results)
    finally:
        try:
            m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
              Services.io.offline = true; await wait(300); Services.io.offline = false;
              return 1;""")
        except Exception:
            pass
        servers.close()


def run_checks(m, version, profile, results):
    global SCREEN_W
    # verfügbare Bildschirmbreite (Windows-VM: 1024 px) – einige Breitenprüfungen hängen davon ab
    SCREEN_W = m.js("return w.screen.availWidth;") or 99999

    def welcome():
        # Erstinstallation (frisches Profil): einmal die Begrüßung im Info-Fenster – was halo.spaces ändert, wo die
        # Einstellungen liegen; Windows/Linux mit dem Plattform-Hinweis im selben Fenster. Theme bleibt „System“
        res = m.js(r"""
          const hw = await until(() => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")
                                                                               && x.document.documentElement.classList.contains("welcome")), 15000);
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const theme = (await AddonManager.getAddonsByTypes(["theme"])).find(a => a.isActive)?.id;
          if (!hw) return { window: false, theme, shown: Services.prefs.getBoolPref("extensions.mailcards.welcomeShown", false) };
          await wait(400); const hd = hw.document, vis = id => { const e = hd.getElementById(id); return !!e && e.getBoundingClientRect().height > 0; };
          const out = { window: true, theme, title: hd.querySelector("h1").textContent, lines: hd.querySelectorAll("#platform-note .line").length,
                        text: hd.getElementById("platform-note").textContent, buttons: ["settings", "close", "update", "feedback", "donate"].filter(vis),
                        overflow: hd.documentElement.scrollHeight - hw.innerHeight, shown: Services.prefs.getBoolPref("extensions.mailcards.welcomeShown", false),
                        note: Services.prefs.getBoolPref("extensions.mailcards.platformNoteShown", false),
                        windows: [...Services.wm.getEnumerator(null)].filter(x => x.location?.href.startsWith("resource://mailcards/about/halo.html")).length };
          hd.getElementById("close").click(); await wait(400);
          out.closed = ![...Services.wm.getEnumerator(null)].some(x => x.location?.href.startsWith("resource://mailcards/about/halo.html"));
          return out;""")
        mac = sys.platform == "darwin"
        ok = (res["window"] and res["title"] == "Welcome to halo.spaces" and "calm and tidy." in res["text"] and " – " not in res["text"]
              and res["buttons"] == ["settings", "close"] and res["overflow"] <= 0 and res["shown"] and res["windows"] == 1
              and res["lines"] == (1 if mac else 2) and ("made for macOS" in res["text"]) != mac and res["note"] != mac
              and res["theme"] == "default-theme@mozilla.org" and "follow your system" not in res["text"] and res["closed"])
        return ok, f"{res}"
    check("Begrüßung: einmal nach der Erstinstallation (kurz, Win/Linux mit Plattform-Hinweis), Theme bleibt System", welcome, results)

    def welcome_steps():
        # Begrüßung schrittweise (KISS): Wetter und Chat erst nur Ja/Nein; Ja beim Wetter bzw. Nein beim Chat lässt die
        # Einzelheiten aufgleiten und das Fenster wächst mit; Stadt mit Vorschlägen beim Tippen; keine Gedankenstriche
        res = m.js(r"""
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const halo = () => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html"));
          halo()?.close(); await wait(300);
          Cu.evalInSandbox(`globalThis.__mcRealFetch = fetchWithTimeout;
            fetchWithTimeout = async (win, url) => {
              const body = url.includes("geocoding") ? { results: [{ name: "Wien", country: "Österreich", latitude: 48.20849, longitude: 16.37208 }] }
                : { current: { weather_code: 1, is_day: 1, temperature_2m: 12.3 } };
              return { ok: true, status: 200, text: async () => JSON.stringify(body) }; };
            enhancer.openHaloWindow(Services.wm.getMostRecentWindow("mail:3pane"), { welcome: true });`, g);
          const out = {};
          try {
            const hw = await until(() => { const x = halo(); return x?.document.getElementById("fifth") && x; }, 8000);
            if (!hw) return { window: false };
            await wait(600);
            const hd = hw.document, P = "extensions.mailcards.";
            const btn = (sec, text) => [...hd.querySelectorAll(`#${sec} button`)].find(b => b.textContent == text);
            const isOpen = sec => hd.querySelector(`#${sec} .more`).classList.contains("open") && hd.querySelector(`#${sec} .more`).getBoundingClientRect().height > 10;
            const shut = sec => hd.querySelector(`#${sec} .more`).getBoundingClientRect().height < 1;
            const fits = () => hd.documentElement.scrollHeight - hw.innerHeight <= 1;
            out.start = { h: hw.innerHeight, weatherShut: shut("weather"), fifthShut: shut("fifth"), dashes: hd.body.textContent.includes(" – "),
                          chatChosen: btn("fifth", "Yes")?.classList.contains("chosen") };
            btn("weather", "Yes").click(); await wait(700);
            out.weatherYes = { open: isOpen("weather"), h: hw.innerHeight, fits: fits() };
            btn("weather", "City …").click(); await wait(300);
            const input = hd.querySelector("#weather .city input"); input.value = "Wi"; input.dispatchEvent(new hw.Event("input"));
            await until(() => hd.querySelector("#weather .suggest:not([hidden]) .suggestion"), 3000); await wait(300);
            const sug = [...hd.querySelectorAll("#weather .suggestion")];
            out.suggest = { labels: sug.map(b => b.textContent), fits: fits() };
            sug[0]?.click(); await wait(800);
            out.chosen = { on: Services.prefs.getBoolPref(P + "weather", false), place: Services.prefs.getStringPref(P + "weatherPlace", ""),
                           status: hd.querySelector("#weather .status").textContent };
            btn("weather", "No").click(); await wait(700);
            out.weatherNo = { shut: shut("weather"), on: Services.prefs.getBoolPref(P + "weather", false), h: hw.innerHeight, fits: fits() };
            btn("fifth", "No").click(); await wait(700);
            out.chatNo = { open: isOpen("fifth"), mode: Services.prefs.getStringPref(P + "fifthSpace", "chat"),
                           nothing: btn("fifth", "Nothing")?.classList.contains("chosen"), choices: [...hd.querySelectorAll("#fifth .choices:not(.yesno) button")].map(b => b.textContent), fits: fits() };
            btn("fifth", "Website …").click(); await wait(300);
            const url = hd.querySelector("#fifth .city input"); url.value = "kalender.example.com"; btn("fifth", "OK").click(); await wait(300);
            out.web = { mode: Services.prefs.getStringPref(P + "fifthSpace", ""), url: Services.prefs.getStringPref(P + "fifthSpaceUrl", "") };
            btn("fifth", "Yes").click(); await wait(700);
            out.chatYes = { shut: shut("fifth"), mode: Services.prefs.getStringPref(P + "fifthSpace", "chat"), fits: fits() };
            out.endDashes = hd.body.textContent.includes(" – ");
            hw.close();
          } finally {
            Cu.evalInSandbox("fetchWithTimeout = __mcRealFetch;", g);
            for (const p of ["weather", "weatherPlace", "weatherState", "fifthSpace", "fifthSpaceUrl"]) Services.prefs.clearUserPref("extensions.mailcards." + p);
          }
          return out;""" % ADDON_ID)
        if res.get("window") is False:
            return False, f"{res}"
        st, wy, sg, ch, wn, cn, wb, cy = (res.get(k) or {} for k in ("start", "weatherYes", "suggest", "chosen", "weatherNo", "chatNo", "web", "chatYes"))
        ok = (st.get("weatherShut") and st.get("fifthShut") and not st.get("dashes") and st.get("chatChosen")
              and wy.get("open") and wy.get("h", 0) > st.get("h", 0) and wy.get("fits")
              and sg.get("labels") == ["Wien, Österreich"] and ch.get("on") and ch.get("place") == "Wien, Österreich" and "Wien" in (ch.get("status") or "")
              and wn.get("shut") and not wn.get("on") and wn.get("h", 999) < wy.get("h", 0) and wn.get("fits")
              and cn.get("open") and cn.get("mode") == "none" and cn.get("nothing") and cn.get("choices") == ["Website …", "Add-on", "Nothing"]
              and wb.get("mode") == "web" and wb.get("url") == "https://kalender.example.com/"
              and cy.get("shut") and cy.get("mode") == "chat" and not res.get("endDashes"))
        return ok, f"{res}"
    check("Begrüßung schrittweise: Wetter und Chat erst Ja/Nein, Einzelheiten gleiten auf, Fenster wächst mit; Stadt mit Vorschlägen", welcome_steps, results)


    # Vorbereitung: Fenstergröße, Testkalender, Fenster ohne Dialoge
    m.js("""
      for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
      w.moveTo(0, 0); w.resizeTo(1500, 900); await wait(500);
      // Marionette sperrt Add-on-Updates – für die Prüfung „Updates beim Start“ erlauben. Die Update-Liste
      // (updates.json auf GitHub) bleibt im Testprofil aber unerreichbar: ein veröffentlichtes Update
      // ersetzte sonst mitten im Lauf Design und Logik des geprüften Pakets
      Services.obs.addObserver({ observe(ch) { ch.QueryInterface(Ci.nsIHttpChannel);
        if (/\\/updates\\.json(\\?|$)/.test(ch.URI.spec)) ch.cancel(Cr.NS_ERROR_ABORT); } }, "http-on-modify-request");
      Services.prefs.setBoolPref("extensions.update.enabled", true);
      if (!testCalendar()) { const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = "Halo Test"; c.setProperty("color", "#FF9500"); cal.manager.registerCalendar(c); }
      return 1;""")

    # (nach der Vorbereitung: sie erlaubt Add-on-Updates, bevor die Prüfung beim Start nach 20 s läuft)
    def today_everywhere():
        # Today-Pane in allen Bereichen außer dem Kalender, nach der Erstinstallation überall eingeblendet
        # (frisches Testprofil = Erstinstallation); im Kalender aus und ihr Schalter dort gesperrt
        res = m.js(r"""
          const panel = d.getElementById("today-pane-panel"), cmd = d.getElementById("calendar_toggle_todaypane_command");
          const shown = () => !!panel && !panel.collapsed && panel.getBoundingClientRect().width > 0;
          // überall gleich wie in der Mail: ohne Aufgabenteil, Termine bis unten
          const look = () => { const todo = d.getElementById("todo-tab-panel"), ag = d.getElementById("agenda-panel");
            return { todo: !!todo && todo.getBoundingClientRect().height > 0, agendaH: Math.round(ag?.getBoundingClientRect().height || 0) }; };
          const looks = {};
          const out = { looks, modes: panel.getAttribute("mode"), collapsed: panel.getAttribute("collapsedinmodes"),
                        pref: Services.prefs.getBoolPref("extensions.mailcards.todayPaneEverywhere", false) };
          await toMail(); await wait(800); out.mail = shown(); looks.mail = look();
          tm.openTab("tasks", {}); await wait(1200); out.tasks = shown(); looks.tasks = look();
          tm.openTab("addressBookTab", {}); await wait(2000); out.addressbook = [shown(), w.gCurrentMode]; looks.addressbook = look();
          w.openPreferencesTab("paneGeneral"); await wait(2000); out.settings = shown(); looks.settings = look();
          tm.openTab("chat", {}); await wait(1500); out.chat = shown(); looks.chat = look();
          await toCalendar(); await wait(1200); out.calendar = [shown(), !!cmd?.disabled];
          for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          await toMail(); await wait(600);
          return out;""")
        ok = (res["pref"] and "special" in res["modes"] and "calendar" not in res["modes"].split(",")
              and res["mail"] and res["tasks"] and res["addressbook"][0] and res["settings"] and res["chat"]
              and res["calendar"] == [False, True]
              and not any(v["todo"] for v in res["looks"].values())
              and all(abs(v["agendaH"] - res["looks"]["mail"]["agendaH"]) <= 2 for v in res["looks"].values()))
        return ok, f"{res}"
    check("Today-Pane: in Mail, Aufgaben, Adressbuch, Einstellungen und Chat gleich (ohne Aufgabenteil), nicht im Kalender; nach der Installation eingeblendet", today_everywhere, results)

    def addon():
        v = m.js("""const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
                    const a = await AddonManager.getAddonByID("%s"); return [a?.version, a?.isActive];""" % ADDON_ID)
        return v == [version, True], f"{v}"
    check("Erweiterung aktiv und richtige Version", addon, results)

    def folder_start_width():
        # Neues Profil, Mail-Tab zuerst offen: Ordnerliste 206 px wie in Apple Mail (und wie nach
        # Doppelklick auf den Trenner) statt Thunderbirds 198 px, sodass „Local Folders“ in den
        # Favoriten neben einer Ungelesen-Zahl nicht gekürzt wird. Muss vor „Ordnerleiste: Ziehen
        # und Doppelklick“ laufen, das die gespeicherte Breite ändert
        res = m.js("""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Inbox")) { root.createSubfolder("Inbox", null); }
          const inbox = root.getChildNamed("Inbox");
          const a3 = await toMail(); await wait(1000); const ad = a3.document;
          const row = await until(() => [...ad.querySelectorAll('#folderTree > li[data-mode="smart"] li[is="folder-tree-row"]')]
            .find(li => li.uri == inbox.URI && li.querySelector(":scope > .container .name")?.clientWidth), 8000);
          const name = row?.querySelector(":scope > .container .name");
          // Ungelesen-Zahl wie im Alltag (einstellig) nur für die Messung anzeigen
          if (row) row.unreadCount = 6; await wait(300);
          const out = { width: Math.round(ad.getElementById("folderPane").getBoundingClientRect().width),
                        pref: Services.prefs.getIntPref("extensions.mailcards.sidebarWidth", 0), text: name?.textContent,
                        count: row?.querySelector(":scope > .container .unread-count")?.textContent,
                        client: name?.clientWidth, scroll: name?.scrollWidth };
          if (row) row.unreadCount = inbox.getNumUnread(false);
          return out;""")
        # die 206 px sind auf die Systemschrift von macOS abgestimmt (dort passt „Local Folders“ genau) – mit
        # anderen Schriften (Linux: 2 px breiter) wird nur die Breite geprüft
        fits = res["scroll"] <= res["client"] or sys.platform != "darwin"
        # Linux: Thunderbird legt die Ordnerliste mit der breiteren Systemschrift schon breiter an (240 px) –
        # dort bleibt sie so (nie schmaler als 206), gemerkt als eigene Breite
        width_ok = res["width"] == 206 and res["pref"] in (0, 206) if sys.platform == "darwin" else \
            res["width"] >= 206 and res["pref"] in (0, res["width"])
        ok = (width_ok and res["text"] == "Local Folders"
              and res["count"] == "6" and res["client"] and fits)
        return ok, f"{res}"
    check("Ordnerliste: im neuen Profil 206 px breit, „Local Folders“ nicht gekürzt", folder_start_width, results)

    def list_width():
        res = m.js("""
          const out = {};
          for (const width of [1500, 2000, 2600]) { w.resizeTo(width, 900); await wait(1300);
            const a3 = await toMail(); out[width] = Math.round(a3.document.getElementById("threadPane").getBoundingClientRect().width); }
          w.resizeTo(1500, 900); await wait(800); return out;""")
        # Windows: die Fensterknöpfe stehen mit in der Toolbar-Zeile – bei 1500 px braucht die Leseansicht dort
        # etwas mehr Platz und die Liste gibt bis zu 30 px ab (gewollte Begrenzung im engen Fenster)
        ok = all(abs(v - 460) <= 1 or (sys.platform == "win32" and k == "1500" and 430 <= v <= 460) for k, v in res.items())
        return ok, f"Listenbreite je Fensterbreite {res} (soll 460)"
    check("Mailliste behält ihre Breite", list_width, results)

    def toolbar_edges():
        res = m.js("""
          const out = [];
          for (const width of [1280, 1500, 2400]) { w.resizeTo(width, 900); await wait(1300);
            const a3 = await toMail(); const off = a3.browsingContext.embedderElement.getBoundingClientRect();
            const row = d.getElementById("unifiedToolbarContainer"); const rl = row.getBoundingClientRect().left;
            const paneRight = Math.round(off.left + a3.document.getElementById("threadPane").getBoundingClientRect().right);
            const lineVar = parseFloat(getComputedStyle(row).getPropertyValue("--mc-list-right"));
            const spacer = d.querySelector('#unifiedToolbarContent > li[item-id="spacer"]').getBoundingClientRect().right;
            const search = Math.round(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]').getBoundingClientRect().width);
            out.push({ width, line: Math.round(lineVar + rl) == paneRight || Math.abs(lineVar + rl - paneRight) <= 2, buttonsRightOfList: spacer >= paneRight, search }); }
          w.resizeTo(1500, 900); await wait(800); return out;""")
        ok = all(r["line"] and r["buttonsRightOfList"] and r["search"] >= 159 for r in res)
        detail = " · ".join(f"{r['width']}px: Linie {'✓' if r['line'] else '✗'}, Knöpfe {'✓' if r['buttonsRightOfList'] else '✗'}, Suche {r['search']}" for r in res)
        return ok, detail
    check("Toolbar: Trennlinie, Knopfkante, Suchfeld", toolbar_edges, results)

    def capsules():
        res = m.js("""
          w.resizeTo(1280, 900); await wait(1300); await toMail();
          const GROUPS = [["get-messages","write-message"],["reply","reply-all","forward-inline"],["archive","delete","junk"],["move-to"],["mark-as"]];
          const bad = [];
          for (const g of GROUPS) {
            const vis = g.map(id => d.querySelector(`#unifiedToolbarContent > li[item-id="${id}"]`)).filter(li => li && li.getBoundingClientRect().width);
            if (!vis.length) continue;
            if (getComputedStyle(vis[0]).borderStartStartRadius != "999px") bad.push(vis[0].getAttribute("item-id") + " links eckig");
            if (getComputedStyle(vis.at(-1)).borderStartEndRadius != "999px") bad.push(vis.at(-1).getAttribute("item-id") + " rechts eckig");
          }
          w.resizeTo(1500, 900); await wait(800); return bad;""")
        return not res, ", ".join(res) or "alle Gruppen rund"
    check("Toolbar-Kapseln auch mit ausgeblendeten Knöpfen rund", capsules, results)

    def week_fits():
        res = m.js("""
          w.resizeTo(1280, 900); await wait(800); await toCalendar(); w.switchToView("week"); await wait(1200);
          const week = rect(d.getElementById("week-view")); const tab = rect(d.getElementById("tabmail"));
          const cols = d.querySelectorAll("#week-view .day-column-heading").length;
          w.resizeTo(1500, 900); await wait(600); return { week: week.r, tab: tab.r, cols };""")
        return res["week"] <= res["tab"] + 1 and res["cols"] == 7, f"Woche endet bei {res['week']}, Tab bei {res['tab']}, {res['cols']} Tage"
    check("Wochenansicht passt ins Fenster (alle 7 Tage)", week_fits, results)

    def quick_window():
        res = m.js("""
          await toCalendar();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(l => l.getBoundingClientRect().width);
          li.querySelector("button").click(); await wait(900);
          const p = d.getElementById("mcQuickPanel"); const t = p.querySelector(".mc-qc-title");
          p.querySelector(".mc-qc-calsel").value = testCalendar().id; p.querySelector(".mc-qc-calsel").dispatchEvent(new w.Event("change"));
          t.value = "Halo Testtermin";
          t.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })); await wait(600);
          const afterIme = (await items("Halo Testtermin")).length;
          t.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(1200);
          await until(() => p.state == "closed", 3000);
          return { opened: true, afterIme, created: (await items("Halo Testtermin")).length, closed: p.state, visibility: d.visibilityState };""")
        # verdeckt pausiert macOS die Schließ-Animation – dann bleibt es bei „hiding“
        closed = res["closed"] == "closed" or (res["closed"] == "hiding" and res["visibility"] == "hidden")
        ok = res["afterIme"] == 0 and res["created"] == 1 and closed
        return ok, f"nach IME-Enter {res['afterIme']}, nach Enter {res['created']} Termin, Fenster {res['closed']} ({res['visibility']})"
    check("Schnellfenster: legt an, IME-Enter nicht", quick_window, results)

    def natural():
        res = m.js('''
          await toCalendar();
          const li = [...d.querySelectorAll('#unifiedToolbarContent li[item-id="new-event"]')].find(l => l.getBoundingClientRect().width);
          li.querySelector("button").click(); await wait(900);
          const p = d.getElementById("mcQuickPanel"); const t = p.querySelector(".mc-qc-title");
          p.querySelector(".mc-qc-calsel").value = testCalendar().id; p.querySelector(".mc-qc-calsel").dispatchEvent(new w.Event("change"));
          t.value = "Halo NL Essen morgen 12:30 für 90 min"; t.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(300);
          p.querySelector(".mc-qc-primary").click(); await wait(1200);
          const it = (await items("Halo NL Essen"))[0];
          if (!it) return null;
          const s = cal.dtz.dateTimeToJsDate(it.startDate), e = cal.dtz.dateTimeToJsDate(it.endDate), tm2 = new Date(); tm2.setDate(tm2.getDate() + 1);
          // nur Tag und Dauer („morgen für 2h“): nicht ganztägig, 2 Stunden lang
          li.querySelector("button").click(); await wait(900);
          const t2 = p.querySelector(".mc-qc-title");
          p.querySelector(".mc-qc-calsel").value = testCalendar().id; p.querySelector(".mc-qc-calsel").dispatchEvent(new w.Event("change"));
          t2.value = "Halo NL Dauer morgen für 2h"; t2.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(300);
          p.querySelector(".mc-qc-primary").click(); await wait(1200);
          const it2 = (await items("Halo NL Dauer"))[0];
          const dur = it2 ? { allDay: it2.startDate.isDate, minutes: (cal.dtz.dateTimeToJsDate(it2.endDate) - cal.dtz.dateTimeToJsDate(it2.startDate)) / 60000,
                              tomorrow: cal.dtz.dateTimeToJsDate(it2.startDate).getDate() == tm2.getDate() } : null;
          return { tomorrow: s.getDate() == tm2.getDate(), start: s.getHours() * 60 + s.getMinutes(), minutes: (e - s) / 60000, dur };''')
        ok = (bool(res) and res["tomorrow"] and res["start"] == 750 and res["minutes"] == 90
              and bool(res["dur"]) and res["dur"]["allDay"] is False and res["dur"]["minutes"] == 120 and res["dur"]["tomorrow"])
        return ok, f"{res}"
    check("Schnellfenster: natürliche Eingabe („morgen 12:30 für 90 min“, „morgen für 2h“ nicht ganztägig)", natural, results)

    def natural_rules():
        # parseNatural direkt über das Experiment-Modul, „jetzt“ = Di 20.10.2026 15:00
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const parse = Cu.evalInSandbox("parseNatural", g);
          const p = n => String(n).padStart(2, "0");
          const f = x => x ? `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}` : "-";
          const out = {};
          for (const t of ["Lunch für 2h um 12 Uhr", "Workshop für 1.5h morgen um 10 Uhr", "Meeting 14:00 für 2h", "Arzt Freitag morgen 8 Uhr",
                           "Arzt morgen 8 Uhr", "Termin 1.3.25", "Call 11-1pm", "Call 2-4pm", "Party 22-2 Uhr", "Arbeit 9-5",
                           "Schicht 18-7 Uhr", "Standup 11-12am", "Gottesdienst Karfreitag morgen 10 Uhr", "Party 11-1am", "Party 10-2am",
                           "Meeting morgen für 2h"]) {
            const r = parse(t, new Date(2026, 9, 20, 15, 0));
            out[t] = `${r.title} | ${f(r.start)} – ${f(r.end)}` + (!r.end && !r.allDay ? ` | ohne Uhrzeit, ${r.duration} min` : "");
          }
          return out;''' % ADDON_ID)
        expected = {
            "Lunch für 2h um 12 Uhr": "Lunch | 20.10.2026 12:00 – 20.10.2026 14:00",
            "Workshop für 1.5h morgen um 10 Uhr": "Workshop | 21.10.2026 10:00 – 21.10.2026 11:30",
            "Meeting 14:00 für 2h": "Meeting | 20.10.2026 14:00 – 20.10.2026 16:00",
            "Arzt Freitag morgen 8 Uhr": "Arzt | 23.10.2026 08:00 – 23.10.2026 09:00",
            "Arzt morgen 8 Uhr": "Arzt | 21.10.2026 08:00 – 21.10.2026 09:00",
            "Termin 1.3.25": "Termin | 01.03.2025 00:00 – -",
            "Call 11-1pm": "Call | 20.10.2026 11:00 – 20.10.2026 13:00",
            "Call 2-4pm": "Call | 20.10.2026 14:00 – 20.10.2026 16:00",
            "Party 22-2 Uhr": "Party | 20.10.2026 22:00 – 21.10.2026 02:00",
            "Arbeit 9-5": "Arbeit | 20.10.2026 09:00 – 20.10.2026 17:00",
            "Schicht 18-7 Uhr": "Schicht | 20.10.2026 18:00 – 21.10.2026 07:00",
            "Standup 11-12am": "Standup | 20.10.2026 11:00 – 20.10.2026 12:00",
            "Gottesdienst Karfreitag morgen 10 Uhr": "Gottesdienst Karfreitag | 21.10.2026 10:00 – 21.10.2026 11:00",
            "Party 11-1am": "Party | 20.10.2026 23:00 – 21.10.2026 01:00",
            "Party 10-2am": "Party | 20.10.2026 22:00 – 21.10.2026 02:00",
            "Meeting morgen für 2h": "Meeting | 21.10.2026 00:00 – - | ohne Uhrzeit, 120 min",
        }
        bad = [f"„{k}“ → {res.get(k)}" for k, v in expected.items() if res.get(k) != v]
        return not bad, "; ".join(bad) or f"{len(expected)} Eingaben richtig (Dauer, Dauer ohne Uhrzeit, „Freitag morgen“, „Karfreitag morgen“, Jahr „25“, am/pm, „12am“, „11-1am“, über Mitternacht)"
    check("Schnellfenster: Dauer, Wochentag mit „morgen“, zweistelliges Jahr, Zeiträume", natural_rules, results)

    def quick_late_allday():
        # Doppelklick auf einen Tag um 23:15: der Termin bleibt an diesem Tag
        # (Uhrzeit im Experiment-Modul kurz auf 23:15 gestellt)
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          await toCalendar();
          let out;
          Cu.evalInSandbox("globalThis.__mcRealDate = Date; Date = class extends __mcRealDate { constructor(...a) { if (a.length) super(...a); else super(2026, 9, 20, 23, 15); } };", g);
          try {
            Cu.evalInSandbox("enhancer", g).openQuickCreate(w, "event", null, { start: new Date(2026, 9, 21), allDay: true });
            const p = d.getElementById("mcQuickPanel"); const f = p.__mc;
            out = { start: f.startDate.value, time: f.startTime.value, end: f.endDate.value, allDay: f.allDay.checked };
            p.hidePopup();
            // „+“ der Today-Pane mit heute als Tag: 0:00 am Folgetag statt 23:00 heute (Beginn in der Vergangenheit)
            const tp = w.TodayPane; const origStart = tp.start;
            tp.start = { year: 2026, month: 9, day: 20 };
            try {
              Cu.evalInSandbox("enhancer", g).openQuickCreate(w, "event", d.getElementById("todaypane-new-event-button"));
              out.todayPane = { start: f.startDate.value, time: f.startTime.value };
            } finally {
              tp.start = origStart;
            }
          } finally {
            Cu.evalInSandbox("Date = globalThis.__mcRealDate; delete globalThis.__mcRealDate;", g);
          }
          d.getElementById("mcQuickPanel").hidePopup(); await wait(400);
          return out;''' % ADDON_ID)
        ok = res == {"start": "2026-10-21", "time": "23:00", "end": "2026-10-21", "allDay": True,
                     "todayPane": {"start": "2026-10-21", "time": "00:00"}}
        return ok, f"{res}"
    check("Schnellfenster: ganztägig um 23 Uhr bleibt am angeklickten Tag, „+“ der Today-Pane um 23 Uhr beginnt morgen 0 Uhr", quick_late_allday, results)

    def quick_dst():
        # Ende der Sommerzeit (25.10.2026, in Europa doppelte Stunde 02:00–03:00): Dauer zählt als
        # echte Dauer wie in Apple Kalender; 02:00 zählt als zweite 02:00 (Winterzeit), wie der Kalender
        # sie speichert – „für 2h“ sind 02:00–04:00 und 120 echte Minuten, angezeigt wie angelegt. Festes
        # Datum, unabhängig vom Testzeitpunkt; ohne Zeitumstellung (CI: UTC) gilt dasselbe
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const enh = Cu.evalInSandbox("enhancer", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          await toCalendar();
          enh.openQuickCreate(w, "event", null, { start: new Date(2026, 9, 25, 2, 0), allDay: false });
          const p = d.getElementById("mcQuickPanel"); const f = p.__mc;
          f.calendar.value = testCalendar().id; f.calendar.dispatchEvent(new w.Event("change"));
          const preset = [f.startTime.value, f.endDate.value, f.endTime.value].join(" ");
          f.title.value = "Halo Umstellung 25.10.2026 für 2h"; f.title.dispatchEvent(new w.Event("input", { bubbles: true }));
          const typed = [f.startDate.value, f.startTime.value, f.endDate.value, f.endTime.value].join(" ");
          f.add.click();
          let it = null;
          for (let i = 0; i < 40 && !it; i++) { it = (await items("Halo Umstellung"))[0]; if (!it) await wait(100); }
          await until(() => p.state == "closed", 3000);
          const tz = cal.dtz.defaultTimezone;
          const hm = dt => { const x = dt.getInTimezone(tz); return `${x.day}. ${x.hour}:${String(x.minute).padStart(2, "0")}`; };
          const out = { preset, typed, item: it ? `${hm(it.startDate)} – ${hm(it.endDate)}` : null, tz: tz.tzid,
                        minutes: it ? (it.endDate.nativeTime - it.startDate.nativeTime) / 60e6 : null,
                      };
          // Termin wieder entfernen – sonst stört er spätere Prüfungen im Oktober 2026
          if (it) try { await testCalendar().deleteItem(it); } catch {}
          return out;''' % ADDON_ID)
        ok = (res["preset"] == "02:00 2026-10-25 03:00" and res["typed"] == "2026-10-25 02:00 2026-10-25 04:00"
              and res["item"] == "25. 2:00 – 25. 4:00" and res["minutes"] == 120)
        return ok, f"{res}"
    check("Schnellfenster: Dauer über die Zeitumstellung (25.10.2026 02:00 „für 2h“ → 120 echte Minuten)", quick_dst, results)

    def quick_checks():
        # ganztägig mit Ende vor dem Beginn → ein Tag; Aufgabe mit Erinnerung bekommt eine Fälligkeit
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const enh = Cu.evalInSandbox("enhancer", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          await toCalendar();
          const open = mode => {
            enh.openQuickCreate(w, mode);
            const p = d.getElementById("mcQuickPanel"); const f = p.__mc;
            f.calendar.value = testCalendar().id; f.calendar.dispatchEvent(new w.Event("change"));
            return [p, f];
          };
          const set = (input, v) => { if (typeof v == "boolean") input.checked = v; else input.value = v; input.dispatchEvent(new w.Event("change")); };
          const find = async t => { for (let i = 0; i < 40; i++) { const x = (await items(t))[0]; if (x) return x; await wait(100); } return null; };
          let [p, f] = open("event");
          f.title.value = "Halo Ganztag rückwärts"; f.title.dispatchEvent(new w.Event("input", { bubbles: true }));
          set(f.allDay, true); set(f.startDate, "2026-11-12"); set(f.endDate, "2026-11-10");
          f.add.click();
          const ev = await find("Halo Ganztag rückwärts");
          await until(() => p.state == "closed", 3000);
          [p, f] = open("task");
          f.title.value = "Halo Aufgabe Erinnerung"; f.title.dispatchEvent(new w.Event("input", { bubbles: true }));
          const before = f.hasDue.checked;
          set(f.alert, "PT15M"); const due = f.hasDue.checked;
          set(f.hasDue, false); const cleared = f.alert.value;
          set(f.alert, "PT15M");
          f.add.click();
          const td = await find("Halo Aufgabe Erinnerung");
          await until(() => p.state == "closed", 3000);
          const out = { ev: ev ? [ev.startDate.icalString, ev.endDate.icalString] : null,
                        task: { before, due, cleared, hasDue: !!td?.dueDate, alarms: td ? td.getAlarms().length : null } };
          for (const it of [ev, td].filter(Boolean)) await testCalendar().deleteItem(it);
          return out;''' % ADDON_ID)
        ok = (res["ev"] == ["20261112", "20261113"] and res["task"] == {"before": False, "due": True, "cleared": "", "hasDue": True, "alarms": 1})
        return ok, f"{res}"
    check("Schnellfenster: ganztägiges Ende vor Beginn, Erinnerung bei Aufgabe", quick_checks, results)

    def emoji():
        res = m.js("""
          const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
          const e = new CalEvent(); e.title = "Geburtstag Testperson";
          const s = cal.dtz.now(); s.hour = 9; s.minute = 0; const en = s.clone(); en.hour = 10;
          e.startDate = s; e.endDate = en; await testCalendar().addItem(e);
          await toCalendar(); w.switchToView("week");
          const label = await until(() => [...d.querySelectorAll("#view-box .event-name-label")].find(l => /Geburtstag Testperson/.test(l.textContent) && l.hasAttribute("data-mc-emoji")));
          const builtin = label?.getAttribute("data-mc-emoji") || null;
          // eigenes Stichwort aus den Einstellungen wirkt sofort und hat Vorrang
          Services.prefs.setStringPref("extensions.mailcards.emojiCustom", "Testperson = ⚽");
          await until(() => label?.getAttribute("data-mc-emoji") == "⚽", 3000);
          const custom = label?.getAttribute("data-mc-emoji") || null;
          Services.prefs.clearUserPref("extensions.mailcards.emojiCustom");
          await until(() => label?.getAttribute("data-mc-emoji") == "🎂", 3000);
          return [builtin, custom, label?.getAttribute("data-mc-emoji") || null];""")
        return res == ["🎂", "⚽", "🎂"], f"eingebaut {res[0]}, eigenes Stichwort {res[1]}, wieder {res[2]}"
    check("Emoji vor Termintitel", emoji, results)

    def emoji_rules():
        # emojiFor direkt über das Experiment-Modul: „Ordination“ nicht in
        # „Koordination“, „Steuer“ nicht in „Steuerung“
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const f = Cu.evalInSandbox("emojiFor", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          const out = {};
          for (const t of ["Ordination Dr. Muster", "Ordinationszeiten", "Koordination Projekt X", "Koordinationsmeeting",
                           "Einkommensteuer", "Steuererklärung", "Steuerungsgruppe", "Steuerkreissitzung", "Steuergruppe", "Steuerunterlagen"]) out[t] = f(t);
          return out;''' % ADDON_ID)
        expected = {"Ordination Dr. Muster": "🩺", "Ordinationszeiten": "🩺", "Koordination Projekt X": "", "Koordinationsmeeting": "👥",
                    "Einkommensteuer": "💰", "Steuererklärung": "💰", "Steuerungsgruppe": "", "Steuerkreissitzung": "",
                    "Steuergruppe": "", "Steuerunterlagen": "💰"}
        bad = [f"„{k}“ → {res.get(k)!r}" for k, v in expected.items() if res.get(k) != v]
        return not bad, "; ".join(bad) or f"{len(expected)} Titel richtig"
    check("Emoji: „Koordination“ ohne Arzt, „Steuerung“, „Steuerkreis“, „Steuergruppe“ ohne Geld", emoji_rules, results)

    def readstatus():
        res = m.js("""
          await toCalendar(); const c = testCalendar(); c.readOnly = true; await wait(800);
          const li = [...d.querySelectorAll("#calendar-list li")].find(l => /Halo Test/.test(l.textContent));
          const shown = getComputedStyle(li.querySelector(".calendar-readstatus")).opacity;
          c.readOnly = false; await wait(400); const hidden = getComputedStyle(li.querySelector(".calendar-readstatus")).opacity;
          return [shown, hidden];""")
        return float(res[0]) > 0 and float(res[1]) == 0, f"schreibgeschützt {res[0]}, normal {res[1]}"
    check("Kalenderliste zeigt Status bei Schreibschutz", readstatus, results)

    def splitter():
        pos = lambda: m.js("""const a3 = await toMail(); const off = a3.browsingContext.embedderElement.getBoundingClientRect();
          const s = a3.document.getElementById("folderPaneSplitter").getBoundingClientRect();
          return [Math.round(off.left + s.left + s.width / 2), Math.round(off.top + s.top + 300), Math.round(a3.document.getElementById("folderPane").getBoundingClientRect().width)];""")
        x, y, before = pos()
        m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}]
                  + [{"type": "pointerMove", "x": x + 5 * i, "y": y, "origin": "viewport", "duration": 20} for i in range(1, 9)]
                  + [{"type": "pointerUp", "button": 0}])
        time.sleep(1.2)
        x, y, dragged = pos()
        m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0},
                   {"type": "pause", "duration": 80}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}])
        time.sleep(1.2)
        reset = pos()[2]
        return dragged > before and reset == 206, f"{before} → gezogen {dragged} → Doppelklick {reset} (soll 206)"
    check("Ordnerleiste: Ziehen und Doppelklick", splitter, results)

    def double_click():
        x, y = m.js('''
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          await toCalendar(); w.switchToView("week"); await wait(1200);
          // Tag ohne Termine – frühere Prüfungen legen heute/morgen welche an, ein
          // Treffer öffnet den Termin statt des Schnellfensters (je nach Wochentag)
          const col = [...d.querySelectorAll("#week-view calendar-event-column")].filter(c => c.getBoundingClientRect().width && ![...c.querySelectorAll("calendar-event-box")].some(b => !b.hidden && b.occurrence))[1];
          const lbl = [...d.querySelectorAll("#week-view .multiday-timebar-time")].find(l => /^\\s*(14[:.]00|0?2:00\\s*PM)\\s*$/i.test(l.textContent));
          lbl.scrollIntoView({ block: "center" }); await wait(500);
          // Aufgehen und Zugehen mitzählen – unter xvfb ohne Fenstermanager klappt
          // das Fenster teils sofort wieder zu
          const qp = d.getElementById("mcQuickPanel"); const t0 = Date.now(); w.__mcQp = { shown: 0, hiddenAfter: null };
          qp?.addEventListener("popupshown", () => { w.__mcQp.shown++; w.__mcQp.t = Date.now(); }, { once: true });
          qp?.addEventListener("popuphidden", () => { w.__mcQp.hiddenAfter = Date.now() - (w.__mcQp.t || t0); }, { once: true });
          const r = col.getBoundingClientRect(); w.__mcColRight = Math.round(r.right + w.mozInnerScreenX); w.__mcColLeft = Math.round(r.left + w.mozInnerScreenX);
          w.__mcColLeftHalf = r.left + r.width / 2 < w.innerWidth / 2;
          return [Math.round(r.left + r.width / 2), Math.round(lbl.getBoundingClientRect().top + 8)];''')
        time.sleep(1.2)
        m.pointer([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0},
                   {"type": "pause", "duration": 80}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}])
        res = m.js('''const p = await until(() => { const q = d.getElementById("mcQuickPanel"); return q?.state == "open" && q; }) || d.getElementById("mcQuickPanel");
          const r = { state: p?.state, line: p?.querySelector(".mc-qc-line1").textContent, shown: w.__mcQp?.shown || 0, hiddenAfter: w.__mcQp?.hiddenAfter ?? null,
            dialogs: [...Services.wm.getEnumerator(null)].filter(x => /calendar-event-dialog/.test(x.location.href)).length,
            placed: p?.__mcPlaced, colRight: w.__mcColRight, colLeft: w.__mcColLeft, leftHalf: w.__mcColLeftHalf };
          p?.hidePopup();
          // falls doch ein Fenster aufging: schließen, sonst fehlt den folgenden Prüfungen der Fokus
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          return r;''')
        # „showing“ = geht gerade auf (in einem verdeckten Fenster bleibt die Animation dort stehen)
        # aufgegangen = jetzt offen oder zumindest einmal gezeigt (xvfb schließt es teils sofort)
        opened = res["state"] in ("open", "showing") or res["shown"] > 0
        # Fenster neben der Spalte, zur Fenstermitte hin (welche Spalte frei ist, hängt vom Wochentag ab)
        placed = res.get("placed") or {}
        if res.get("leftHalf"):
            beside = placed.get("side") == "right" and placed.get("x", 0) >= res["colRight"]
        else:
            beside = placed.get("side") == "left" and placed.get("x", 0) < res["colLeft"]
        ok = opened and beside and res["dialogs"] == 0 and ("14:" in res["line"] or "02:00 PM" in res["line"] or "2:00 PM" in res["line"])
        return ok, (f"Fenster {res['state']} (gezeigt {res['shown']}×, zu nach {res['hiddenAfter']} ms), {res['line']}, große Dialoge {res['dialogs']}, "
                    f"Lage {placed} (Spalte endet bei {res['colRight']})")
    check("Doppelklick im Kalender öffnet das Schnellfenster", double_click, results)

    def quick_beside_day():
        # Schnellfenster neben dem angeklickten Tag (Monat), auf der Seite zur Fenstermitte: Tag links → rechts
        # daneben, Tag rechts → links daneben; senkrecht ganz im Fenster. Aufruf wie beim Doppelklick, nur ohne Maus
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const enh = Cu.evalInSandbox("enhancer", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          w.resizeTo(1500, 900); await wait(600);
          await toCalendar(); w.switchToView("month"); await wait(1200);
          const boxes = [...d.querySelectorAll("#month-view calendar-month-day-box")].filter(b => b.getBoundingClientRect().width);
          const out = { boxes: boxes.length };
          const win = { l: w.mozInnerScreenX, t: w.mozInnerScreenY, r: w.mozInnerScreenX + w.innerWidth, b: w.mozInnerScreenY + w.innerHeight };
          for (const [name, box] of [["links", boxes[14]], ["rechts", boxes[20]], ["unten", boxes.at(-1)]]) {
            if (!box) continue;
            const r = box.getBoundingClientRect();
            const rect = { left: r.left + w.mozInnerScreenX, top: r.top + w.mozInnerScreenY, width: r.width, height: r.height };
            enh.openQuickCreate(w, "event", null, { start: new Date(2026, 9, 21), allDay: true, at: { x: rect.left + 5, y: rect.top + 5, rect } });
            const p = d.getElementById("mcQuickPanel");
            const open = await until(() => p.state == "open", 3000);
            await wait(300);
            const placed = p.__mcPlaced, shown = open ? p.getOuterScreenRect() : null;
            out[name] = { side: placed?.side, x: placed?.x, y: placed?.y, cellL: Math.round(rect.left), cellR: Math.round(rect.left + rect.width),
                          shown: shown && { x: Math.round(shown.x), y: Math.round(shown.y), w: Math.round(shown.width), h: Math.round(shown.height) } };
            p.hidePopup(); await until(() => p.state == "closed", 2000); await wait(200);
          }
          // Tagesansicht: eine Spalte fast so breit wie das Fenster – das Fenster
          // erscheint neben der Klickstelle, nicht am Fensterrand
          const wide = { left: win.l + 260, top: win.t + 200, width: w.innerWidth - 280, height: 0 };
          for (const [name, cx] of [["tagLinks", wide.left + 150], ["tagRechts", wide.left + wide.width - 150]]) {
            enh.openQuickCreate(w, "event", null, { start: new Date(2026, 9, 21, 14), allDay: false, at: { x: cx, y: wide.top, rect: wide } });
            const p = d.getElementById("mcQuickPanel");
            await until(() => p.state == "open", 3000);
            const placed = p.__mcPlaced;
            out[name] = { side: placed?.side, x: placed?.x, click: Math.round(cx), cellW: Math.round(wide.width) };
            p.hidePopup(); await until(() => p.state == "closed", 2000); await wait(200);
          }
          out.win = { l: Math.round(win.l), t: Math.round(win.t), r: Math.round(win.r), b: Math.round(win.b) };
          return out;''' % ADDON_ID)
        W = 380
        def beside(x, to_right):
            if not x or x.get("x") is None:
                return False
            return x["x"] >= x["cellR"] if to_right else x["x"] + W <= x["cellL"]
        def inside(x):
            s = x.get("shown")
            if not s:  # unter xvfb ohne Fenstermanager klappt das Fenster teils sofort zu – dann die berechnete Lage
                return res["win"]["t"] <= x["y"] and x["x"] >= res["win"]["l"] and x["x"] + W <= res["win"]["r"]
            # tatsächliche Lage: dort, wo berechnet (Schatten/Rand eingerechnet), ganz im Fenster
            return (abs(s["x"] - x["x"]) <= 30 and abs(s["y"] - x["y"]) <= 30
                    and s["y"] >= res["win"]["t"] - 30 and s["y"] + s["h"] <= res["win"]["b"] + 30)
        left, right, low = res.get("links") or {}, res.get("rechts") or {}, res.get("unten") or {}
        dl, dr = res.get("tagLinks") or {}, res.get("tagRechts") or {}
        day_ok = (dl.get("side") == "right" and dl.get("x") is not None and dl["click"] <= dl["x"] <= dl["click"] + 40
                  and dr.get("side") == "left" and dr.get("x") is not None and dr["click"] - W - 40 <= dr["x"] <= dr["click"] - W)
        ok = (day_ok and res.get("boxes", 0) >= 28 and left.get("side") == "right" and right.get("side") == "left" and low.get("side") == "left"
              and beside(left, True) and beside(right, False) and beside(low, False) and inside(left) and inside(right) and inside(low))
        return ok, f"{res}"
    check("Schnellfenster: neben dem angeklickten Tag, zur Fenstermitte hin, ganz im Fenster, in der Tagesansicht neben der Klickstelle", quick_beside_day, results)

    def duplicate_cards():
        # dieselbe Mail (gleiche Message-ID) mehrfach (Gmail-Labels, Kopien): in der Konversation und als eigene Zeile
        # direkt dahinter nur eine Karte, die Antwort darunter bleibt sichtbar
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Doppelt")) { root.createSubfolder("Doppelt", null); await wait(800); }
          const f = root.getChildNamed("Doppelt"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          if (!f.getTotalMessages(false)) {
            const msg = (id, extra, min, subj) => `From - Sat Oct 17 10:00:00 2026\r\nFrom: Max Muster <max@example.invalid>\r\nSubject: ${subj}\r\nDate: Sat, 17 Oct 2026 10:${min}:00 +0200\r\nMessage-ID: <${id}@example.invalid>\r\n${extra}\r\nText\r\n`;
            const re = "In-Reply-To: <halo-dup-1@example.invalid>\r\nReferences: <halo-dup-1@example.invalid>\r\n";
            lf.addMessage(msg("halo-dup-1", "", "01", "Glasfaser"));
            lf.addMessage(msg("halo-dup-1", "", "01", "Glasfaser"));
            lf.addMessage(msg("halo-dup-2", re, "05", "Re: Glasfaser"));
            lf.addMessage(msg("halo-dup-2", re, "05", "Re: Glasfaser"));
            await wait(800);
          }
          Services.prefs.setIntPref("mail.threadpane.listview", 0);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(1200);
          a3.gViewWrapper.showThreaded = true; await wait(600);
          a3.gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll); await wait(1200);
          const rows = [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"]')];
          const shown = rows.filter(r => r.getBoundingClientRect().height > 0);
          return { viewRows: a3.gDBView.rowCount, rows: rows.length, shown: shown.map(r => a3.gDBView.getMsgHdrAt(r._index)?.messageId),
                   dup: rows.filter(r => r.hasAttribute("data-mc-dup")).length };""")
        ok = res["viewRows"] == 4 and res["dup"] == 2 and sorted(res["shown"]) == ["halo-dup-1@example.invalid", "halo-dup-2@example.invalid"]
        return ok, f"{res}"
    check("Mailliste: dieselbe Mail mehrfach (in der Konversation oder direkt dahinter) nur einmal als Karte, Antwort bleibt", duplicate_cards, results)

    def hover_actions():
        # wie Apple Mail: beim Überfahren der geöffneten Mail eine Kapsel mittig auf der Linie unter
        # dem Kopf (Löschen | Antworten, Allen antworten, Weiterleiten); in der Mailliste keine mehr
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Inbox")) { root.createSubfolder("Inbox", null); await wait(800); }
          const inbox = root.getChildNamed("Inbox"); const lf = inbox.QueryInterface(Ci.nsIMsgLocalMailFolder);
          for (const n of [1, 2]) lf.addMessage(`From - Sat Oct 17 10:00:00 2026\\r\\nFrom: Test ${n} <t${n}@example.invalid>\\r\\nSubject: Halo Karte ${n}\\r\\nDate: Sat, 17 Oct 2026 10:0${n}:00 +0200\\r\\nMessage-ID: <halo-card-${n}@example.invalid>\\r\\n\\r\\nTest\\r\\n`);
          const a3 = await toMail(); a3.displayFolder(inbox.URI);
          await until(() => a3.document.querySelectorAll('#threadTree tr[is="thread-card"]').length >= 2, 15000);
          const listActions = a3.document.querySelectorAll('#threadTree .mc-actions, #threadTree .mc-action').length;
          a3.threadTree.selectedIndex = 0;
          const am = a3.messageBrowser.contentWindow; const md = am.document;
          // erst wenn die Mail angezeigt ist (vorher ist der Kopf noch zusammengeklappt)
          const box = await until(() => { const b = md.getElementById("mcHoverActions"); return b && md.getElementById("messageHeader").getBoundingClientRect().width > 200 && b.getBoundingClientRect().width > 60 && b; }, 10000);
          if (!box) return { found: false, header: Math.round(md.getElementById("messageHeader")?.getBoundingClientRect().width || 0), box: Math.round(md.getElementById("mcHoverActions")?.getBoundingClientRect().width || 0) };
          const header = md.getElementById("messageHeader");
          const cs = am.getComputedStyle;
          const order = [...box.querySelectorAll(".mc-hover-action, .mc-hover-sep")].map(e => e.className.replace(/^mc-hover-action /, ""));
          const idle = cs(box).pointerEvents;
          // ohne Überblendung (verdeckte Testfenster halten Übergänge an)
          box.style.setProperty("transition", "none", "important");
          InspectorUtils.addPseudoClassLock(md.documentElement, ":hover");
          const shown = cs(box).pointerEvents, opacity = cs(box).opacity;
          const r = box.getBoundingClientRect(), h = header.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          // die Kapsel liegt über dem Mailtext, nicht darunter (untere Hälfte, unter der Linie)
          await wait(100);
          const hit = md.elementFromPoint(cx, cy + r.height / 4);
          const btn = box.querySelector(".mc-hover-reply");
          md.documentElement.dispatchEvent(new am.MouseEvent("mouseenter"));
          const enabledMatch = [...box.querySelectorAll(".mc-hover-action")].every(b => b.disabled == !am.commandController.isCommandEnabled(b.dataset.command));
          const out = { found: true, listActions, order, idle, shown, opacity, w: Math.round(r.width), h: Math.round(r.height),
                        dx: Math.round(cx - (h.left + h.width / 2)), dy: Math.round(cy - h.bottom), hit: hit?.closest?.("#mcHoverActions") ? "box" : hit?.id || hit?.localName,
                        icon: cs(btn, "::before").maskImage.slice(0, 20), tabbable: [...box.querySelectorAll("button")].filter(b => b.tabIndex >= 0).length,
                        labeled: [...box.querySelectorAll("button")].every(b => b.getAttribute("aria-label")), enabledMatch };
          // Löschen per Knopf: Mail in den Papierkorb, Thunderbirds Rückgängig geht
          const txn = w.messenger?.transactionManager ?? MailServices.txns.transactionManager; const undo0 = txn.numberOfUndoItems;
          box.querySelector(".mc-hover-delete").click();
          out.inbox = await until(() => inbox.getTotalMessages(false) == 1 && 1, 6000);
          out.undoItems = txn.numberOfUndoItems - undo0;
          if (out.undoItems > 0) { w.messenger ? w.messenger.undo(w.msgWindow) : txn.undoTransaction(); out.undone = await until(() => inbox.getTotalMessages(false) == 2 && 2, 6000); }
          InspectorUtils.clearPseudoClassLocks(md.documentElement); box.style.removeProperty("transition");
          return out;''')
        if not res.get("found"):
            return False, f"keine Kapsel in der Leseansicht: {res}"
        ok = (res["listActions"] == 0 and res["order"] == ["mc-hover-delete", "mc-hover-sep", "mc-hover-reply", "mc-hover-replyall", "mc-hover-forward"]
              and res["shown"] == "auto" and res["opacity"] == "1" and abs(res["dx"]) <= 2 and abs(res["dy"]) <= 2 and 20 <= res["h"] <= 32 and res["hit"] == "box"
              and res["icon"].startswith("url(") and res["tabbable"] == 0 and res["labeled"] and res["enabledMatch"]
              and res.get("inbox") == 1 and res["undoItems"] >= 1 and res.get("undone") == 2)
        return ok, f"{res}"
    check("Mailansicht: Aktionen beim Überfahren als Kapsel unter dem Mailkopf (Löschen | Antworten, Allen antworten, Weiterleiten), keine in der Mailliste", hover_actions, results)

    def reply_forward_marks():
        # wie Apple Mail: links vom Absenderbild grauer Pfeil für beantwortet (nach links) bzw. weitergeleitet (nach rechts);
        # ungelesen zeigt weiter den blauen Punkt
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Markierungen")) root.createSubfolder("Markierungen", null);
          const f = root.getChildNamed("Markierungen");
          const raw = (id, subject) => ["From - Mon Oct 19 10:00:00 2026", "From: Anna Beispiel <anna@example.invalid>", "To: Halo <halo@example.invalid>",
            `Subject: ${subject}`, "Date: Mon, 19 Oct 2026 10:00:00 +0200", `Message-ID: <${id}@example.invalid>`, "", "Text", ""].join("\r\n");
          if (!f.getTotalMessages(false)) {
            const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
            lf.addMessage(raw("mark-replied", "Halo beantwortet")); lf.addMessage(raw("mark-forwarded", "Halo weitergeleitet")); lf.addMessage(raw("mark-unread", "Halo ungelesen weitergeleitet"));
            await wait(800);
          }
          const hdr = id => [...f.messages].find(h => h.messageId == id + "@example.invalid");
          const D = Ci.nsIMsgFolder;
          f.addMessageDispositionState(hdr("mark-replied"), D.nsMsgDispositionState_Replied);
          f.addMessageDispositionState(hdr("mark-forwarded"), D.nsMsgDispositionState_Forwarded);
          f.addMessageDispositionState(hdr("mark-unread"), D.nsMsgDispositionState_Forwarded);
          for (const id of ["mark-replied", "mark-forwarded"]) hdr(id).markRead(true);
          hdr("mark-unread").markRead(false);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(1500);
          const out = {};
          for (const row of a3.document.querySelectorAll('#threadTree tr[is="thread-card"]')) {
            const h = a3.gDBView.getMsgHdrAt(row.index); const id = h?.messageId?.split("@")[0]; if (!id?.startsWith("mark-")) continue;
            const rs = row.querySelector(".read-status"), av = row.querySelector(".mc-avatar"), cs = a3.getComputedStyle(rs);
            const r = rs.getBoundingClientRect(), ar = av?.getBoundingClientRect();
            out[id] = { vis: cs.display != "none" && cs.visibility != "hidden" && r.width > 0, mask: /M10 6/.test(cs.maskImage) ? "reply" : /M14 6/.test(cs.maskImage) ? "forward" : cs.maskImage == "none" ? "none" : "?",
                        left: ar ? Math.round(ar.left - r.right) : null, mid: ar ? Math.round((r.top + r.height / 2) - (ar.top + ar.height / 2)) : null, bg: cs.backgroundColor,
                        dateIcon: [...row.querySelectorAll("img.state")].some(e => e.getBoundingClientRect().width > 0) };
          }
          out.accent = a3.getComputedStyle(a3.document.documentElement).getPropertyValue("--mt-accent").trim();
          return out;""")
        rp, fw, un = res.get("mark-replied") or {}, res.get("mark-forwarded") or {}, res.get("mark-unread") or {}
        ok = (rp.get("vis") and rp.get("mask") == "reply" and fw.get("vis") and fw.get("mask") == "forward"
              and un.get("vis") and un.get("mask") == "none" and all(0 <= x.get("left", -1) <= 12 for x in (rp, fw))
              and all(abs(x.get("mid", 99)) <= 2 and not x.get("dateIcon") for x in (rp, fw, un)))
        return ok, f"{res}"
    check("Mailliste: beantwortet/weitergeleitet als grauer Pfeil links vom Absenderbild wie Apple Mail, ungelesen weiter mit Punkt", reply_forward_marks, results)

    def list_date_future():
        # Datum in der Mailliste: heute nur die Uhrzeit, in der Zukunft (falsche Uhr,
        # Spam „oben halten“) das ganze Datum statt nur der Uhrzeit; „jetzt“ = Di 20.10.2026 15:00
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const f = Cu.evalInSandbox("appleListDate", g); const now = new Date(2026, 9, 20, 15, 0);
          return { today: f(new Date(2026, 9, 20, 10, 15).getTime(), now), yesterday: f(new Date(2026, 9, 19, 10, 15).getTime(), now),
                   tomorrow: f(new Date(2026, 9, 21, 10, 15).getTime(), now),
                   nextYear: f(new Date(2027, 2, 1, 10, 15).getTime(), now), older: f(new Date(2026, 9, 17, 10, 15).getTime(), now) };''' % ADDON_ID)
        # immer mit Uhrzeit: „Today, 10:15“, „Yesterday, 10:15“, älter „17.10.2026, 10:15“ (Format des Systems)
        has_time = lambda v: re.search(r"10[:.]15", v or "") is not None
        ok = (res["today"].startswith("Today, ") and "2026" not in res["today"] and res["yesterday"].startswith("Yesterday, ")
              and "2026" in res["tomorrow"] and "21" in res["tomorrow"] and "2027" in res["nextYear"] and "2026" in res["older"]
              and all(has_time(res[k]) for k in ("today", "yesterday", "tomorrow", "older")))
        return ok, f"{res}"
    check("Mailliste: Datum immer mit Uhrzeit („Today, …“, „Yesterday, …“, älter mit Datum), in der Zukunft das ganze Datum", list_date_future, results)

    def smart_folder_names():
        # Favoriten: nur das Postfach je Konto unter „Alle Eingänge“ heißt wie das Konto –
        # Unterordner darunter und Ordner unter den Kontozeilen behalten ihren Namen
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Inbox")) { root.createSubfolder("Inbox", null); await wait(800); }
          const inbox = root.getChildNamed("Inbox");
          if (!inbox.containsChildNamed("Rechnungen")) { inbox.createSubfolder("Rechnungen", null); await wait(800); }
          if (!root.containsChildNamed("Projekte")) { root.createSubfolder("Projekte", null); await wait(800); }
          const sub = inbox.getChildNamed("Rechnungen"), own = root.getChildNamed("Projekte");
          const a3 = await toMail(); const ad = a3.document;
          const smart = () => [...ad.querySelectorAll(\'#folderTree > li[data-mode="smart"] li[is="folder-tree-row"]\')];
          const nameOf = li => li?.querySelector(":scope > .container .name")?.textContent;
          const find = (f, underServer) => smart().find(li => li.uri == f.URI &&
            !!li.parentElement?.closest("li")?.hasAttribute("data-server-type") == underServer);
          await until(() => find(sub, false) && find(own, true), 8000);
          // erst prüfen, wenn die Dekoration nach dem Einfügen der Zeilen gelaufen ist
          // (sie läuft im nächsten Bild) – sonst stünden hier Thunderbirds eigene
          // Namen, und die Prüfung bestünde auch ohne Korrektur
          const frames = await Promise.race([new Promise(r => a3.requestAnimationFrame(() => a3.requestAnimationFrame(() => r(true)))), wait(5000).then(() => false)]);
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const L = Cu.evalInSandbox("appleLabels", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global)();
          const top = ad.querySelector('#folderTree > li[data-mode="smart"] > ul > li[is="folder-tree-row"][data-folder-type="inbox"]');
          return { modes: a3.folderPane?.activeModes, frames, visibility: d.visibilityState, inbox: nameOf(find(inbox, false)), account: root.server.prettyName,
                   sub: nameOf(find(sub, false)), underAccount: nameOf(find(own, true)), top: nameOf(top), allInboxes: L.native ? null : L.allInboxes };''' % ADDON_ID)
        if not res.get("modes") or "smart" not in res["modes"]:
            return False, f"Favoriten nicht eingeschaltet {res}"
        if not res["frames"]:
            return True, f"Testfenster verdeckt (kein Bild gezeichnet) – übersprungen {res}"
        ok = (res["sub"] == "Rechnungen" and res["underAccount"] == "Projekte" and res["inbox"] == res["account"]
              and (res["allInboxes"] is None or res["top"] == res["allInboxes"]))
        return ok, f"{res}"
    check("Favoriten: Unterordner behalten ihren eigenen Namen statt des Kontonamens", smart_folder_names, results)

    def account_dot_rename():
        # Farbpunkt vor dem Kontonamen: neue und umbenannte Konten bekommen ihn
        # sofort (früher nur die Konten vom Start). Feed-Konto ohne Abos – kein
        # Netzzugriff –, wird danach wieder entfernt
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const color = Cu.evalInSandbox("accountColor", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          const a3 = await toMail(); const ad = a3.document;
          const srv = MailServices.accounts.createIncomingServer("nobody", "halo-feeds.invalid", "rss");
          srv.prettyName = "Halo Feeds"; srv.doBiff = false;
          const acc = MailServices.accounts.createAccount(); acc.incomingServer = srv;
          const row = () => ad.querySelector(`#folderTree > li[data-mode="all"] li[is="folder-tree-row"][data-server-type][data-server-key="${srv.key}"]`);
          const dot = () => row()?.style.getPropertyValue("--mc-acc") || "";
          const out = { row: false };
          try {
            out.row = !!(await until(() => row(), 8000));
            out.added = await until(() => dot(), 6000);
            out.addedWant = color("Halo Feeds");
            srv.prettyName = "Halo Feeds Neu";
            out.renamedWant = color("Halo Feeds Neu");
            out.renamed = await until(() => dot() == out.renamedWant && dot(), 6000) || dot();
            out.name = row()?.querySelector(":scope > .container .name")?.textContent;
          } finally {
            MailServices.accounts.removeAccount(acc, true); await wait(800);
          }
          return out;''' % ADDON_ID)
        ok = res["row"] and res["added"] == res["addedWant"] and res["renamed"] == res["renamedWant"]
        return ok, f"{res}"
    check("Ordnerliste: neue und umbenannte Konten bekommen ihren Farbpunkt sofort", account_dot_rename, results)

    def card_sender_date():
        # Absender nur als Adresse → Name aus der Domain; Datum vor gestern ganz;
        # kompakte Dichte: Abstand oben und unten gleich (früher unten ~10 px mehr)
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Karten")) { root.createSubfolder("Karten", null); await wait(800); }
          const f = root.getChildNamed("Karten");
          f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Mon Jan 05 10:00:00 2026\\r\\nFrom: \\"rueckgabe@amazon.de\\" <rueckgabe@amazon.de>\\r\\nSubject: Ihre Ruecksendung\\r\\nDate: Mon, 05 Jan 2026 10:00:00 +0100\\r\\nMessage-ID: <halo-amazon@example.invalid>\\r\\n\\r\\nIhre Ruecksendung ist eingegangen.\\r\\n");
          const a3 = await toMail(); a3.displayFolder(f.URI);
          const out = {};
          for (const density of [1, 0]) {
            Services.prefs.setIntPref("mail.uidensity", density); await wait(1200);
            const row = await until(() => a3.document.querySelector(\'#threadTree tr[is="thread-card"] .mc-preview\')?.textContent && a3.document.querySelector(\'#threadTree tr[is="thread-card"]\'), 8000);
            if (!row) return { diag: true, density, rows: a3.gDBView?.rowCount, folder: a3.gFolder?.URI,
              cards: [...a3.document.querySelectorAll('#threadTree tr')].map(r => [r.getAttribute("is"), r.querySelector(".mc-preview")?.textContent ?? null]),
              preview: Services.prefs.getIntPref("extensions.mailcards.previewLines", -1), view: Services.prefs.getIntPref("mail.threadpane.listview", -1) };
            const r = sel => row.querySelector(sel).getBoundingClientRect();
            const c = r(".card-container"), sn = r(".sender"), pv = r(".mc-preview"), av = r(".mc-avatar"), dot = r(".read-status");
            out[density] = { sender: row.querySelector(".sender").textContent, date: row.querySelector(".date").textContent,
                             top: Math.round(sn.top - c.top), bottom: Math.round(c.bottom - pv.bottom),
                             dot: Math.round((dot.top + dot.height / 2) - (av.top + av.height / 2)) };
          }
          Services.prefs.clearUserPref("mail.uidensity"); await wait(800);
          // im Mailkopf derselbe Name
          a3.threadTree.selectedIndex = 0;
          const md = a3.messageBrowser.contentWindow.document;
          await until(() => md.querySelector("#fromRecipient0 .recipient-single-line")?.textContent == "Amazon", 5000);
          const header = md.querySelector("#fromRecipient0 .recipient-single-line")?.textContent;
          return { cards: out, header };''')
        if res.get("diag"):
            return False, f"keine Karte mit Vorschau – Diagnose {res}"
        ok = res["header"] == "Amazon" and all(v["sender"] == "Amazon" and "2026" in v["date"] and 0 <= v["bottom"] - v["top"] <= 3 and abs(v["dot"]) <= 2 for v in res["cards"].values())
        return ok, f"{res}"
    check("Mailkarte und Mailkopf: Absendername aus der Domain, ganzes Datum, Abstände oben/unten gleich", card_sender_date, results)

    maillist_checks(m, results)

    def reading():
        res = m.js(MESSAGE_JS + '''
          const am = a3.messageBrowser.contentWindow; const md = am.document;
          const box = await until(() => md.querySelector("#fromRecipient0 .recipient-avatar.mc-hdr-avatar"));
          const body = md.getElementById("messagepane")?.contentDocument;
          const pre = await until(() => body?.querySelector(".moz-text-plain pre, .moz-text-flowed, div.moz-text-plain"));
          const font = pre ? body.defaultView.getComputedStyle(pre).fontFamily : "";
          const title = a3.document.getElementById("threadPaneFolderName")?.textContent || "";
          const head = [...a3.document.querySelectorAll("#threadPaneHeaderBar *")].map(e => e.textContent).join(" ");
          const vis = e => !!e && e.getBoundingClientRect().height > 0;
          const banner = md.getElementById("mcListBanner");
          return { avatar: box?.textContent.trim(), size: box ? Math.round(box.getBoundingClientRect().width) : 0, font, title, undefinedInHeader: /undefined|null/.test(head),
                   listIdRow: vis(md.getElementById("expandedlist-id")), banner: vis(banner), unsub: !!banner?.querySelector(".mc-lb-unsub"),
                   folder: md.querySelector("#mcHdrMeta .mc-hdr-folder")?.textContent, date: md.querySelector("#mcHdrMeta #dateLabel")?.textContent };''')
        ok = (res["avatar"] == "AB" and res["size"] >= 36 and "monospace" not in res["font"].lower() and not res["undefinedInHeader"]
              and not res["listIdRow"] and res["banner"] and res["unsub"] and "Lesen" in (res["folder"] or "") and res["date"])
        return ok, f"{res}"
    check("Leseansicht wie Apple: Absenderbild, Ordner, Verteiler-Hinweis statt List-ID", reading, results)

    def star_button():
        # Symbolleiste: Verschieben ohne Trennstrich; Markieren als geteilter Stern-Knopf – Stern
        # setzt/entfernt „Starred“ an der Testmail, der Pfeil öffnet das Menü, Hervorhebung je Hälfte
        res = m.js(MESSAGE_JS + '''
          w.resizeTo(1500, 900); await wait(1000);
          const hdr = a3.gDBView.hdrForFirstSelectedMessage; if (hdr.isFlagged) { hdr.folder.markMessagesFlagged([hdr], false); await wait(300); }
          const li = d.querySelector('#unifiedToolbarContent > li[item-id="mark-as"]'); const btn = li.querySelector("button");
          const move = d.querySelector('#unifiedToolbarContent > li[item-id="move-to"] button');
          const popup = d.getElementById("toolbarMarkPopup"); const icon = btn.querySelector(".button-icon");
          const r = btn.getBoundingClientRect(), y = r.top + r.height / 2;
          const at = (type, x) => btn.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, view: w, clientX: r.left + x, clientY: y, button: 0, detail: 1 }));
          const out = { moveLine: w.getComputedStyle(move, "::before").content, markLine: w.getComputedStyle(btn, "::before").content,
                        disabled: btn.disabled, maskOff: w.getComputedStyle(icon).maskImage.length };
          at("click", 20); await wait(500);
          out.flagged = hdr.isFlagged; out.starred = li.hasAttribute("mc-starred"); out.popupAfterStar = popup.state;
          out.maskOn = w.getComputedStyle(icon).maskImage.length; out.colorOn = w.getComputedStyle(icon).backgroundColor;
          at("click", 20); await wait(500);
          out.unflagged = !hdr.isFlagged; out.unstarred = !li.hasAttribute("mc-starred");
          hdr.folder.markMessagesFlagged([hdr], true); await wait(500); out.listener = li.hasAttribute("mc-starred");
          hdr.folder.markMessagesFlagged([hdr], false); await wait(500); out.listenerOff = !li.hasAttribute("mc-starred");
          at("mousemove", 20); out.hotStar = li.getAttribute("mc-hot");
          at("mousemove", 55); out.hotMenu = li.getAttribute("mc-hot");
          at("click", 55); await until(() => popup.state == "open", 3000); out.popup = popup.state; out.flaggedByMenu = hdr.isFlagged;
          popup.hidePopup(); await wait(400);
          // Tabwechsel: Stern folgt der Mail des gewählten Tabs (Mail mit Stern hier, ohne Stern im Nachrichten-Tab)
          if (!root.containsChildNamed("Stern-Tab")) { root.createSubfolder("Stern-Tab", null); await wait(800); }
          const sf = root.getChildNamed("Stern-Tab");
          if (!sf.getTotalMessages(false)) {
            sf.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Sat Oct 17 10:00:00 2026\\r\\nFrom: Ben Muster <ben@example.invalid>\\r\\nSubject: Halo ohne Stern\\r\\nDate: Sat, 17 Oct 2026 10:00:00 +0200\\r\\nMessage-ID: <halo-stern-tab@example.invalid>\\r\\n\\r\\nText\\r\\n");
            await wait(800);
          }
          const other = [...sf.messages].find(h => !h.isFlagged);
          if (other) {
            const tm = d.getElementById("tabmail"), first = tm.currentTabInfo;
            hdr.folder.markMessagesFlagged([hdr], true); await wait(400);
            tm.openTab("mailMessageTab", { messageURI: other.folder.getUriForMsg(other), background: false });
            const msgTab = tm.currentTabInfo;
            await until(() => msgTab.message?.messageKey == other.messageKey && !li.hasAttribute("mc-starred"), 5000);
            out.tabOther = { starred: li.hasAttribute("mc-starred") };
            tm.switchToTab(first); await until(() => li.hasAttribute("mc-starred"), 3000);
            out.tabBack = { starred: li.hasAttribute("mc-starred") };
            tm.switchToTab(msgTab); await until(() => !li.hasAttribute("mc-starred"), 3000);
            out.tabAgain = { starred: li.hasAttribute("mc-starred") };
            tm.closeTab(msgTab); await wait(400);
            hdr.folder.markMessagesFlagged([hdr], false); await wait(300);
          }
          return out;''')
        tabs_ok = (res.get("tabOther", {}).get("starred") is False and res.get("tabBack", {}).get("starred") is True
                   and res.get("tabAgain", {}).get("starred") is False)
        ok = (tabs_ok and res["moveLine"] == "none" and res["markLine"] != "none" and not res["disabled"] and res["flagged"] and res["starred"]
              and res["popupAfterStar"] == "closed" and res["maskOn"] != res["maskOff"] and res["unflagged"] and res["unstarred"]
              and res["listener"] and res["listenerOff"] and res["hotStar"] == "star" and res["hotMenu"] == "menu"
              and res["popup"] in ("open", "showing") and not res["flaggedByMenu"])
        return ok, f"{res}"
    check("Symbolleiste: Verschieben ohne Trennstrich, Stern-Knopf setzt Starred, Pfeil öffnet Menü, Stern folgt dem Tab", star_button, results)

    def header_account_dot():
        # Mailkopf: Farbpunkt des Kontos links vom Ordnersymbol; Lokale Ordner
        # ohne Punkt. Feed-Konto ohne Abos (kein Netzzugriff), danach entfernt
        res = m.js(MESSAGE_JS + '''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const color = Cu.evalInSandbox("accountColor", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
          const md = () => a3.messageBrowser.contentWindow.document;
          const folderEl = () => md().querySelector("#mcHdrMeta .mc-hdr-folder");
          await until(() => folderEl()?.textContent.includes("Lesen"), 5000);
          const out = { localDot: !!folderEl()?.querySelector(".mc-hdr-acc") };
          const srv = MailServices.accounts.createIncomingServer("nobody", "halo-kopf.invalid", "rss");
          srv.prettyName = "Halo Kopf"; srv.doBiff = false;
          const acc = MailServices.accounts.createAccount(); acc.incomingServer = srv;
          try {
            srv.rootFolder.createSubfolder("Kopfpunkt", null); await wait(800);
            const g = srv.rootFolder.getChildNamed("Kopfpunkt");
            g.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(unescape(encodeURIComponent("From - Sat Oct 17 10:00:00 2026\\r\\nFrom: Anna Beispiel <anna@example.invalid>\\r\\nTo: Halo Test <halo@example.invalid>\\r\\nSubject: Kopfpunkt\\r\\nDate: Sat, 17 Oct 2026 09:41:00 +0200\\r\\nMessage-ID: <halo-kopfpunkt@example.invalid>\\r\\nContent-Type: text/plain; charset=UTF-8\\r\\n\\r\\nHallo\\r\\n")));
            await wait(800);
            a3.displayFolder(g.URI); await wait(800);
            a3.threadTree.selectedIndex = 0;
            const dot = await until(() => folderEl()?.textContent.includes("Kopfpunkt") && folderEl().querySelector(".mc-hdr-acc"), 6000);
            out.want = color("Halo Kopf");
            if (dot) {
              const st = md().defaultView.getComputedStyle(dot);
              out.color = dot.style.getPropertyValue("--mc-acc");
              out.bg = st.backgroundColor; out.radius = st.borderRadius;
              const d = dot.getBoundingClientRect(), t = folderEl().querySelector(".mc-hdr-folder-text").getBoundingClientRect();
              out.size = [Math.round(d.width), Math.round(d.height)];
              // Ordnersymbol (14 px) sitzt zwischen Punkt und Text
              out.gap = Math.round(t.left - d.right);
            }
          } finally {
            a3.displayFolder(f.URI); await wait(500);
            MailServices.accounts.removeAccount(acc, true); await wait(800);
          }
          return out;''' % ADDON_ID)
        ok = (not res["localDot"] and res.get("color") == res["want"] and res.get("size") == [8, 8]
              and res.get("bg") not in (None, "", "rgba(0, 0, 0, 0)") and 14 <= res.get("gap", 0) <= 30)
        return ok, f"{res}"
    check("Mailkopf: Farbpunkt des Kontos vor dem Ordnersymbol, Lokale Ordner ohne Punkt", header_account_dot, results)

    def header_avatar_refresh():
        # Adressbuch-Änderung (Stern im Mailkopf, CardDAV): Thunderbird setzt sein
        # Bild neu (ein Buchstabe) – danach steht wieder das eigene Absenderbild
        res = m.js(MESSAGE_JS + '''
          const am = a3.messageBrowser.contentWindow; const md = am.document;
          const box = await until(() => md.querySelector("#fromRecipient0 .recipient-avatar.mc-hdr-avatar"));
          const foreign = () => !!box?.querySelector(":scope > span, :scope > img[data-l10n-id]");
          const before = box?.textContent.trim();
          md.getElementById("fromRecipient0").updateRecipient();
          const replaced = foreign();
          await until(() => !foreign(), 3000); await wait(200);
          return { before, replaced, after: box?.textContent.trim(), foreign: foreign() };''')
        ok = res["before"] == "AB" and res["replaced"] and not res["foreign"] and res["after"] == "AB"
        return ok, f"{res}"
    check("Mailkopf: Absenderbild bleibt nach einer Adressbuch-Änderung (nicht Thunderbirds Buchstabe)", header_avatar_refresh, results)

    def unsubscribe():
        res = m.js(MESSAGE_JS + '''
          const am = a3.messageBrowser.contentWindow; const md = am.document;
          const btn = await until(() => md.querySelector("#mcListBanner .mc-lb-unsub"));
          // nicht wirklich den Browser öffnen: Aufruf abfangen
          const orig = am.openLinkExternally; let opened = null;
          am.openLinkExternally = url => { opened = String(url); };
          btn?.click(); await wait(300);
          am.openLinkExternally = orig;
          const log = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "mail-cards-debug.log")).catch(() => "");
          return { button: !!btn, opened, error: /unsubscribe error/.test(log) };''')
        return res["button"] and res["opened"] == "https://example.invalid/abmelden?id=1" and not res["error"], f"{res}"
    check("Verteiler-Hinweis: Abmelden öffnet den Link", unsubscribe, results)

    def header_long_name():
        # eigene Adresse bei mehreren Identitäten: Thunderbird schreibt „Name <Adresse>“
        # in den Kopf – nur der Name; lange Namen enden mit „…“ vor Ordner und
        # Uhrzeit statt darunter zu laufen (neues Profil auf dem Mac mini)
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
          const ids = [["Halo Ich", "ich@example.invalid"], ["Halo Arbeit", "arbeit@example.invalid"]].map(([n, e]) => {
            const id = MailServices.accounts.createIdentity(); id.fullName = n; id.email = e; acc.addIdentity(id); return id; });
          const name = "Postfach mit einem sehr langen Namen ich@example.invalid";
          if (!root.containsChildNamed(name)) { root.createSubfolder(name, null); await wait(800); }
          const f = root.getChildNamed(name);
          const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          lf.addMessage("From - Sat Oct 17 10:00:00 2026\r\nFrom: Halo Ich <ich@example.invalid>\r\nSubject: Eigene Mail\r\nDate: Sat, 17 Oct 2026 11:43:00 +0200\r\nMessage-ID: <halo-own@example.invalid>\r\n\r\nTest\r\n");
          lf.addMessage("From - Sat Oct 17 10:00:00 2026\r\nFrom: Maximiliane Sophie von und zu Langnamenhausen-Beispiel <lang@example.invalid>\r\nSubject: Langer Name\r\nDate: Sat, 17 Oct 2026 11:44:00 +0200\r\nMessage-ID: <halo-long@example.invalid>\r\n\r\nTest\r\n");
          await wait(800);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          const md = () => a3.messageBrowser.contentWindow.document;
          const out = {};
          for (const i of [0, 1]) {
            const key = a3.gDBView.getMsgHdrAt(i).subject == "Eigene Mail" ? "own" : "long";
            a3.threadTree.selectedIndex = i; await wait(2000);
            const d = md(); const li = d.querySelector("#fromRecipient0"); const meta = d.getElementById("mcHdrMeta");
            const nameEl = [li?.querySelector(".recipient-multi-line-name"), li?.querySelector(".recipient-single-line")].find(e => e?.getBoundingClientRect().width);
            out[key] = { text: nameEl?.textContent, nameRight: Math.round(li?.getBoundingClientRect().right), metaLeft: Math.round(meta?.getBoundingClientRect().left),
                         cut: !!nameEl && nameEl.scrollWidth > nameEl.clientWidth, header: Math.round(d.getElementById("messageHeader").getBoundingClientRect().right),
                         row: Math.round(d.getElementById("headerSenderToolbarContainer").getBoundingClientRect().right) };
          }
          // Testidentitäten wieder weg (die zuerst angelegte ist Standard und geht zuletzt)
          for (const id of ids.reverse()) { try { acc.removeIdentity(id); } catch {} }
          return out;""")
        own, long = res["own"], res["long"]
        ok = (own["text"] == "Halo Ich" and long["nameRight"] <= long["metaLeft"] and long["cut"]
              and long["row"] <= long["header"])
        return ok, f"{res}"
    check("Mailkopf: eigene Adresse nur mit Namen, lange Namen mit „…“ vor Ordner und Uhrzeit", header_long_name, results)

    def one_click_unsubscribe():
        # List-Unsubscribe-Post (RFC 8058, z. B. Google): nachfragen, dann POST
        # statt Browser – der Link ergäbe dort nur eine leere Seite. Testadresse
        # ist gesperrt (example.invalid), daher greift danach der Browser als Rückfall.
        m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("EinKlick")) { root.createSubfolder("EinKlick", null); await wait(800); }
          const f = root.getChildNamed("EinKlick");
          f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Sat Oct 17 10:00:00 2026\r\nFrom: Google <noreply-accounts@example.invalid>\r\nSubject: Kontodaten geteilt\r\nDate: Sat, 17 Oct 2026 09:41:00 +0200\r\nMessage-ID: <halo-oneclick@example.invalid>\r\nList-Unsubscribe: <https://example.invalid/ein-klick?id=7>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nList-Id: <abc@example.invalid>\r\n\r\nTest\r\n");
          await wait(800);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          a3.threadTree.selectedIndex = 0; await wait(2000);
          const am = a3.messageBrowser.contentWindow;
          await until(() => am.document.querySelector("#mcListBanner .mc-lb-unsub"));
          am.__mcOrigOpen ??= am.openLinkExternally; am.__mcOpened = null;
          am.openLinkExternally = url => { am.__mcOpened = String(url); };
          return 1;""")
        am = "const a3 = await toMail(); const am = a3.messageBrowser.contentWindow;"
        click = am + 'am.document.querySelector("#mcListBanner .mc-lb-unsub")?.click(); return 1;'
        opened = am + "await until(() => am.__mcOpened, 3000); return am.__mcOpened;"

        # der Dialog kommt asynchron – Marionette meldet ihn als Alert
        def alert(cmd):
            for _ in range(20):
                try:
                    return m.cmd(cmd, {}) or True
                except RuntimeError:
                    time.sleep(0.25)
            return None
        m.js(click)
        text = (alert("WebDriver:GetAlertText") or {}).get("value", "")
        alert("WebDriver:DismissAlert")
        after_cancel = m.js(opened)
        m.js(click)
        accepted = alert("WebDriver:AcceptAlert")
        after_accept = m.js(opened)
        m.js(am + "if (am.__mcOrigOpen) am.openLinkExternally = am.__mcOrigOpen; return 1;")
        res = {"prompt": text, "afterCancel": after_cancel, "accepted": bool(accepted), "opened": after_accept}
        ok = "no longer" in text and after_cancel is None and accepted and after_accept == "https://example.invalid/ein-klick?id=7"
        return ok, f"{res}"
    check("Verteiler-Hinweis: Ein-Klick-Abmeldung fragt nach und sendet statt Browser", one_click_unsubscribe, results)

    def unsubscribe_identity():
        # nur Abmelde-Mail (mailto, z. B. LISTSERV): Absender ist die Identität,
        # an die die Mail ging, nicht die erste/Standard-Identität. Das
        # Verfassen-Fenster wird nur geöffnet und ungesendet wieder geschlossen;
        # die zweite Test-Identität wird danach wieder entfernt (die erste wie
        # in COMPOSE_JS bleibt – die letzte lässt Thunderbird nicht entfernen).
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const acc = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer);
          const ensure = (name, email) => { if (acc.identities.some(i => i.email == email)) return null; const id = MailServices.accounts.createIdentity(); id.fullName = name; id.email = email; acc.addIdentity(id); return id; };
          if (!acc.identities.length) ensure("Halo Test", "halo@example.invalid");
          const added = ensure("Halo Arbeit", "arbeit@example.invalid");
          const first = acc.identities[0]?.email;
          let cw = null; let from = null; let to = ""; let button = false;
          try {
            const root = MailServices.accounts.localFoldersServer.rootFolder;
            if (!root.containsChildNamed("Liste")) { root.createSubfolder("Liste", null); await wait(800); }
            const f = root.getChildNamed("Liste");
            if (!f.getTotalMessages(false)) {
              f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Sat Oct 17 10:00:00 2026\r\nFrom: Halo Liste <liste@example.invalid>\r\nTo: Halo Arbeit <arbeit@example.invalid>\r\nSubject: Rundbrief\r\nDate: Sat, 17 Oct 2026 09:41:00 +0200\r\nMessage-ID: <halo-listserv@example.invalid>\r\nList-Id: <rundbrief.example.invalid>\r\nList-Unsubscribe: <mailto:listserv@example.invalid?body=SIGNOFF%20RUNDBRIEF>\r\n\r\nTest\r\n");
              await wait(800);
            }
            const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
            a3.threadTree.selectedIndex = 0; await wait(1500);
            const am = a3.messageBrowser.contentWindow;
            // about:message bleibt beim Mailwechsel geladen: erst klicken, wenn der Hinweis
            // zur Rundbrief-Mail gehört, nicht noch der der vorigen Ein-Klick-Mail ist
            const btn = await until(() => { const b = am.document.querySelector("#mcListBanner .mc-lb-unsub");
              return (am.gMessage?.messageId == "halo-listserv@example.invalid" && b?.title.startsWith("listserv@example.invalid") && b) || null; }, 10000);
            button = !!btn;
            const before = new Set(Services.wm.getEnumerator("msgcompose"));
            btn?.click();
            cw = await until(() => [...Services.wm.getEnumerator("msgcompose")].find(x => !before.has(x)), 8000);
            from = await until(() => cw?.gCurrentIdentity?.email, 8000);
            to = cw?.gMsgCompose?.compFields?.to || [...(cw?.document.querySelectorAll("mail-address-pill") || [])].map(p => p.emailAddress).join(",");
          } finally {
            cw?.close(); await wait(500);
            try { if (added) acc.removeIdentity(added); } catch {}
          }
          return { button, compose: !!cw, first, from, to };""")
        ok = (res["button"] and res["compose"] and res["first"] != "arbeit@example.invalid"
              and res["from"] == "arbeit@example.invalid" and "listserv@example.invalid" in (res["to"] or ""))
        return ok, f"{res}"
    check("Verteiler-Hinweis: Abmelde-Mail geht von der Identität, an die die Mail ging", unsubscribe_identity, results)

    def html_font():
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Schrift")) { root.createSubfolder("Schrift", null); await wait(800); }
          const f = root.getChildNamed("Schrift"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          const mail = (n, body) => `From: Halo <h@example.invalid>\r\nSubject: Schrift ${n}\r\nDate: Sat, 17 Oct 2026 10:0${n}:00 +0200\r\nMessage-ID: <halo-font-${n}@example.invalid>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${body}\r\n\r\n`;
          if (!f.getTotalMessages(false)) {
            lf.addMessage(mail(1, "<html><body><p id='t'>Ohne eigene Schrift</p><img src='https://example.invalid/bild.png' width='1' height='1'></body></html>"));
            lf.addMessage(mail(2, "<html><body style='font-family: Georgia, serif'><p id='t'>Mit eigener Schrift</p></body></html>"));
            lf.addMessage(mail(3, "<html><body><p id='t'>Bild</p><img id='bild' src='https://example.invalid/logo.png' alt='Icono 1' width='48' height='40'><img id='pixel' src='https://example.invalid/p.gif' alt='' width='1' height='1'></body></html>"));
            await wait(800);
          }
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          const out = {};
          for (let i = 0; i < a3.gDBView.rowCount; i++) {
            if (!/Schrift [12]$/.test(a3.gDBView.getMsgHdrAt(i).subject)) continue;
            a3.threadTree.selectedIndex = i; await wait(1500);
            const md = a3.messageBrowser.contentDocument;
            const body = await until(() => md.getElementById("messagepane")?.contentDocument?.getElementById("t"));
            const subj = a3.gDBView.getMsgHdrAt(i).subject;
            out[subj] = body ? body.ownerDocument.defaultView.getComputedStyle(body).fontFamily : null;
            out.pill = md.getElementById("header-view-toolbox")?.getBoundingClientRect().width || 0;
            out.dates = [...md.querySelectorAll("#dateLabel, #dateLabelSubject")].filter(e => e.getBoundingClientRect().width).length;
          }
          return out;""")
        own, plain = res.get("Schrift 2") or "", res.get("Schrift 1") or ""
        ok = "apple-system" in plain and own.startswith("Georgia") and not res["pill"] and res["dates"] == 1
        return ok, f"{res}"
    check("Mails in Systemschrift, eigene Schrift bleibt, keine Kapsel im Kopf", html_font, results)

    def html_dark():
        # Dunkelmodus: HTML-Mail mit eigenem hellem Hintergrund erscheint dunkel (Thunderbirds Umfärbung, halo-Option
        # „Dunkle Hintergründe für Nachrichten“), ausgeschaltet hell; hell bleibt sie hell. Ohne Umfärbung (ältere
        # Thunderbird-Versionen) entfällt die Option
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const api = Cu.evalInSandbox("mailCards.prototype.getAPI({})", g).mailCards;
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Schrift")) { root.createSubfolder("Schrift", null); await wait(800); }
          const f = root.getChildNamed("Schrift");
          const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          const has = () => { for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).subject == "Schrift 4") return i; return -1; };
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          if (has() < 0) {
            lf.addMessage("From: Halo <h@example.invalid>\r\nSubject: Schrift 4\r\nDate: Sat, 17 Oct 2026 10:04:00 +0200\r\nMessage-ID: <halo-font-4@example.invalid>\r\n" +
              "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html><body style='background:#ffffff;color:#000000'><p id='t'>Heller Newsletter</p></body></html>\r\n\r\n");
            await wait(800); a3.displayFolder(f.URI); await wait(800);
          }
          const st = await api.getSettings();
          const show = async () => { a3.threadTree.selectedIndex = -1; await wait(300); a3.threadTree.selectedIndex = has(); await wait(1500);
            const md = a3.messageBrowser.contentDocument;
            const t = await until(() => md.getElementById("messagepane")?.contentDocument?.getElementById("t")); await wait(500);
            const doc = t.ownerDocument, cs = doc.defaultView.getComputedStyle(doc.body);
            const lum = c => { const v = (c.match(/[\d.]+/g) || []).map(Number); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
            return Math.round(lum(cs.backgroundColor) > 0 && cs.backgroundColor != "rgba(0, 0, 0, 0)" ? lum(cs.backgroundColor) : lum(doc.defaultView.getComputedStyle(doc.documentElement).backgroundColor)); };
          const out = { dark: w.matchMedia("(prefers-color-scheme: dark)").matches, available: st.darkReader, option: st.darkMessages };
          if (!st.darkReader) return out;
          out.on = await show();
          await api.setSetting("darkMessages", false); out.off = await show();
          await api.setSetting("darkMessages", true); out.stored = Services.prefs.prefHasUserValue("mail.dark-reader.enabled");
          return out;""" % ADDON_ID)
        if not res.get("available"):
            return True, f"Thunderbird ohne eigene Umfärbung – Option entfällt {res}"
        ok = res["option"] is True and res["off"] > 200 and not res["stored"] and (res["on"] < 80 if res["dark"] else res["on"] > 200)
        return ok, f"{res}"
    check("Dunkelmodus: HTML-Mail mit hellem Hintergrund dunkel (Option „Dunkle Hintergründe für Nachrichten“), ausgeschaltet und hell bleibt sie hell", html_dark, results)

    def wide_newsletter():
        # breiter Newsletter (feste 700 px) wird wie in Apple Mail auf die Lesebreite verkleinert statt rechts
        # abgeschnitten; eine schmale Mail bleibt in Originalgröße
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Schrift")) { root.createSubfolder("Schrift", null); await wait(800); }
          const f = root.getChildNamed("Schrift"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          const find = s => { for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).subject == s) return i; return -1; };
          const add = (n, body) => lf.addMessage(`From: Halo <h@example.invalid>\r\nSubject: ${n}\r\nDate: Sat, 17 Oct 2026 11:00:00 +0200\r\nMessage-ID: <halo-${n.replace(/ /g, "-")}@example.invalid>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${body}\r\n\r\n`);
          if (find("Breiter Newsletter") < 0) {
            add("Breiter Newsletter", "<html><body><table id='t' width='700' style='width:700px'><tr><td>Angebot der Woche – erfundener Newsletter mit fester Breite</td></tr></table></body></html>");
            add("Schmale Mail", "<html><body><p id='t'>Kurzer Gruß</p></body></html>");
            await wait(800); a3.displayFolder(f.URI); await wait(800);
          }
          const show = async s => { a3.threadTree.selectedIndex = find(s); await wait(1500);
            const md = a3.messageBrowser.contentDocument;
            const t = await until(() => md.getElementById("messagepane")?.contentDocument?.getElementById("t")); await wait(600);
            const doc = t.ownerDocument, r = doc.documentElement;
            return { zoom: doc.body.style.zoom || "", scroll: r.scrollWidth, client: r.clientWidth, table: Math.round(t.getBoundingClientRect().width) }; };
          return { wide: await show("Breiter Newsletter"), narrow: await show("Schmale Mail") };""")
        wd, nr = res["wide"], res["narrow"]
        ok = (wd["zoom"] not in ("", "1") and wd["scroll"] <= wd["client"] + 1 and nr["zoom"] == "")
        return ok, f"{res}"
    check("Leseansicht: breiter Newsletter auf die Lesebreite verkleinert, schmale Mail unverändert", wide_newsletter, results)

    def print_style():
        # gedruckte Mail wie Apple Mail: Kopf in Systemschrift, Beschriftungen halbfett grau, Betreff fett, feine Linie
        # darunter, Textmail in Systemschrift (Druckdarstellung über mediumOverride = "print" nachgestellt)
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Druck")) { root.createSubfolder("Druck", null); await wait(800); }
          const f = root.getChildNamed("Druck"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          if (!f.getTotalMessages(false)) {
            lf.addMessage("From: Anna Beispiel <anna@example.invalid>\r\nTo: Halo Test <halo@example.invalid>\r\nCc: Ben <ben@example.invalid>\r\nSubject: Druckprobe\r\nDate: Sat, 17 Oct 2026 10:00:00 +0200\r\nMessage-ID: <halo-print@example.invalid>\r\n\r\nHallo,\r\ndas ist eine Probe.\r\n");
            await wait(800);
          }
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800); a3.threadTree.selectedIndex = 0; await wait(1500);
          const mp = a3.messageBrowser.contentDocument.getElementById("messagepane");
          const md = mp.contentDocument, mw = mp.contentWindow, cs = e => mw.getComputedStyle(e);
          const before = cs(md.querySelector(".moz-main-header")).display;
          mp.browsingContext.mediumOverride = "print"; await wait(300);
          try {
            const h1 = md.querySelector(".moz-header-part1"), last = [...md.querySelectorAll(".moz-main-header")].pop();
            const label = md.querySelector(".moz-header-display-name"), subj = h1.querySelector("tr td");
            const pre = md.querySelector(".moz-text-plain pre");
            return { before, shown: cs(h1).display, font: cs(h1).fontFamily, label: [cs(label).fontWeight, cs(label).color], subject: cs(subj).fontWeight,
                     line: [cs(last).borderBottomStyle, cs(last).borderBottomWidth], body: cs(pre).fontFamily };
          } finally { mp.browsingContext.mediumOverride = ""; }""")
        ok = (res["before"] == "none" and res["shown"] != "none" and ("-apple-system" in res["font"] or "system-ui" in res["font"])
              and res["label"][0] == "600" and res["subject"] == "700" and res["line"][0] == "solid"
              and ("-apple-system" in res["body"] or "system-ui" in res["body"]))
        return ok, f"{res}"
    check("Drucken: Mail mit Kopf wie Apple Mail (Systemschrift, Beschriftungen grau, Betreff fett, Linie), Text in Systemschrift", print_style, results)

    def remote_bar():
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const f = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Schrift");
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).subject == "Schrift 1") a3.threadTree.selectedIndex = i;
          const md = a3.messageBrowser.contentDocument; const mw = md.defaultView;
          const n = await until(() => md.querySelector('#mail-notification-top notification-message[value="remoteContent"]'));
          await until(() => n?.shadowRoot?.querySelector("style.mc-layout"), 3000); await wait(600);
          const text = n?.shadowRoot?.querySelector(".text-container")?.getBoundingClientRect();
          const btn = n?.querySelector("button")?.getBoundingClientRect();
          return { bar: !!n, styled: !!n?.shadowRoot?.querySelector("style.mc-layout"), paneWidth: Math.round(md.documentElement.clientWidth),
                   sameRow: !!(text && btn && btn.top < text.bottom && btn.left >= text.right - 1), bg: n && mw.getComputedStyle(n).backgroundColor };""")
        yellow = res.get("bg", "").startswith("rgb(255, 2")
        return res.get("bar") and res.get("styled") and res.get("sameRow") and yellow, f"{res}"
    check("Hinweis über der Mail: Knopf neben dem Text, Farbe unverändert", remote_bar, results)

    def blocked_image():
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const f = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Schrift");
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(800);
          for (let i = 0; i < a3.gDBView.rowCount; i++) if (a3.gDBView.getMsgHdrAt(i).subject == "Schrift 3") a3.threadTree.selectedIndex = i;
          const md = a3.messageBrowser.contentDocument;
          const img = await until(() => md.getElementById("messagepane")?.contentDocument?.getElementById("bild"));
          await wait(800);
          const px = img.ownerDocument.getElementById("pixel");
          const cs = img.ownerDocument.defaultView.getComputedStyle(img), r = img.getBoundingClientRect(), pr = px.getBoundingClientRect();
          return { placeholder: cs.backgroundImage.includes("svg"), textHidden: cs.color == "rgba(0, 0, 0, 0)" || parseFloat(cs.fontSize) == 0, size: [Math.round(r.width), Math.round(r.height)], pixel: [Math.round(pr.width), Math.round(pr.height)] };""")
        ok = res["placeholder"] and res["textHidden"] and res["size"] == [48, 40] and max(res["pixel"]) <= 1
        return ok, f"{res}"
    check("Blockierte Bilder: Platzhalter statt Ersatztext, Zählpixel unsichtbar", blocked_image, results)

    reading_checks(m, results)
    compose_checks(m, results)
    folder_checks(m, results)
    dialog_checks(m, results)
    menu_checks(m, results)
    calendar_checks(m, results)

    def min_widths():
        res = m.js('''
          const out = {};
          const probe = async (name, open, getEl) => {
            await open(); w.resizeTo(1500, 900); await wait(1500);
            w.resizeTo(600, 900); await wait(1500);
            const el = getEl(); const r = el?.getBoundingClientRect();
            out[name] = { window: w.outerWidth, pane: r ? Math.round(r.width) : null, min: el ? parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).minWidth) : null };
          };
          await probe("mail", () => toMail(), () => tm.currentAbout3Pane.document.getElementById("messagePane"));
          await probe("calendar", () => toCalendar(), () => d.getElementById("calendarDisplayBox"));
          await probe("settings", async () => { w.openPreferencesTab(); await wait(2000); }, () => tm.currentTabInfo.browser.contentDocument.getElementById("preferencesContainer"));
          // Chat: früher sperrte der ausgeblendete Kalender die Breite (Fenster ließ sich nicht verkleinern)
          await probe("chat", async () => { tm.openTab("chat", {}); await wait(1500); }, () => d.getElementById("conversationsBox"));
          out.chat.inside = d.documentElement.getBoundingClientRect().width <= w.innerWidth + 1;
          w.resizeTo(1500, 900); await wait(800); await toMail();
          return out;''')
        # Adressbuch (Bearbeiten): schmales Fenster und weit gezogener Teiler –
        # die Details bleiben mindestens so breit wie vorgegeben und im Fenster
        res["addressbook"] = m.js(ADDRESS_EDIT_JS + '''
          w.resizeTo(600, 900); await wait(1500);
          ad.body.style.setProperty("--sharedSplitter-width", "2000px"); await wait(800);
          const el = ad.getElementById("detailsPane"), r = el.getBoundingClientRect();
          const out = { window: w.outerWidth, pane: Math.round(r.width), min: parseFloat(ab.getComputedStyle(el).minWidth),
            inside: r.right <= ab.innerWidth + 1 };
          ad.body.style.removeProperty("--sharedSplitter-width");
          ab.detailsPane.isDirty = false; ad.getElementById("cancelEditButton").click(); await wait(300);
          tm.closeTab(tm.currentTabInfo); w.resizeTo(1500, 900); await wait(800); await toMail();
          return out;''')
        # auf einem schmalen Bildschirm (Windows-VM: 1024 px) begrenzt halo.spaces die Mindestbreite auf den Bildschirm –
        # passt das Adressbuch dann nicht ganz hinein, ist das kein Fehler
        ab_ok = res["addressbook"]["inside"] or res["addressbook"]["window"] >= SCREEN_W - 2
        ok = res["chat"]["window"] < 1400 and res["chat"]["inside"] and ab_ok and res["addressbook"]["min"] >= 480 and all(v["pane"] is not None and v["pane"] >= v["min"] - 1 and v["window"] > 600 for v in res.values())
        return ok, f"{res}"
    check("Mindestbreiten: Fenster wird nicht schmaler als die Bereiche", min_widths, results)

    def ab_min_width_unselected():
        # Adressbuch ohne Auswahl: das Fenster lässt sich wieder schmaler ziehen
        # (früher sperrte der ausgeblendete Kalender die Breite auf die aktuelle);
        # nach Wahl eines Kontakts bleiben die Details mindestens so breit wie vorgegeben
        res = m.js(r"""
          w.resizeTo(1500, 900); await wait(800);
          tm.openTab("addressBookTab", {});
          const tab = tm.currentTabInfo;
          const ab = await until(() => { const c = tab.browser?.contentWindow; return c?.document?.getElementById("cards")?.view?.rowCount && c; }, 8000);
          const ad = ab.document, list = ad.getElementById("cards"), dp = ad.getElementById("detailsPane");
          const out = {};
          // ohne Auswahl gibt es nur noch in einem leeren Adressbuch (sonst wählt
          // halo.spaces immer einen Kontakt)
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const empty = MailServices.ab.getDirectoryFromId(MailServices.ab.newAddressBook("Halo Ohne Auswahl", "", Ci.nsIAbManager.JS_DIRECTORY_TYPE));
          try {
            await wait(800);
            ab.booksList.selectedIndex = ab.booksList.getIndexForUID(empty.UID); await wait(800);
            out.hidden = dp.hidden || !dp.getClientRects().length;
            w.resizeTo(1500, 900); await wait(1000);
            w.resizeTo(1250, 900); await wait(1200);
            out.narrow = w.outerWidth;
            ab.booksList.selectedIndex = 0; await wait(800);
            list.selectedIndex = 0; await wait(1000);
            w.resizeTo(600, 900); await wait(1500);
            const r = dp.getBoundingClientRect();
            out.pane = Math.round(r.width); out.min = parseFloat(ab.getComputedStyle(dp).minWidth);
            out.inside = r.right <= ab.innerWidth + 1; out.window = w.outerWidth;
            out.today = w.TodayPane?.isVisible ? Math.round(d.getElementById("today-pane-panel").getBoundingClientRect().width) : 0;
          } finally {
            tm.closeTab(tab); w.resizeTo(1500, 900); await wait(800);
            MailServices.ab.deleteAddressBook(empty.URI); await wait(300);
          }
          return out;""")
        # (mit Today-Pane – seit sie auch im Adressbuch steht – entsprechend breiter)
        ok = (res["hidden"] and res["narrow"] < 1450 + res.get("today", 0) and res["pane"] >= res["min"] - 1 and res["min"] >= 480
              and (res["inside"] or res["window"] >= SCREEN_W - 2) and res["window"] > 600)
        return ok, f"{res}"
    check("Adressbuch ohne Auswahl: Fenster lässt sich verkleinern, Details danach mindestens so breit wie vorgegeben", ab_min_width_unselected, results)

    def chat_toolbar():
        # Chat ohne Konto: leerer Zustand ruhig (Info-Symbol in Tertiärgrau, Text 13 px grau,
        # Knopf voll deckend und ohne Dauer-Fokusring); Statuskapsel mit 13-px-Text und flachem
        # Punkt; deaktivierte Knöpfe ohne Hover; Knöpfe und Suche überlappen nie
        res = m.js(r"""
          const cs = el => w.getComputedStyle(el);
          const colorOf = (value, prop = "color") => { const e = d.createElementNS("http://www.w3.org/1999/xhtml", "div"); e.style[prop] = value;
            d.documentElement.append(e); const c = cs(e)[prop]; e.remove(); return c; };
          const { IMServices } = ChromeUtils.importESModule("resource:///modules/IMServices.sys.mjs");
          const gus = IMServices.core.globalUserStatus;
          const q = s => d.querySelector(s);
          const search = () => q('#unifiedToolbarContent > li[item-id="search-bar"]').getBoundingClientRect();
          const out = {};
          try {
            w.resizeTo(1500, 900); await wait(800);
            tm.openTab("chat", {}); await wait(1500);
            // leerer Zustand: Gruppe voll deckend, Erklärtext 13 px grau, Knopf in Akzentfarbe, eigenes Info-Symbol in Tertiärgrau
            const box = d.getElementById("noConvBox"), btn = d.getElementById("openIMAccountWizardButton");
            let dim = []; for (let e = btn; e && !e.classList?.contains("im-placeholder-screen"); e = e.parentElement) { if (parseFloat(cs(e).opacity) < 1) dim.push(e.id || e.className); }
            const desc = d.getElementById("noAccountDesc");
            out.empty = { inner: cs(d.getElementById("noAccountInnerBox")).opacity, dim, descSize: cs(desc).fontSize,
              descOk: cs(desc).color == colorOf("var(--mt-text-secondary)"), btnOk: cs(btn).backgroundColor == colorOf("var(--mt-accent)", "backgroundColor"),
              icon: cs(box).backgroundImage.includes("mailcards/icons/info.svg"), stroke: cs(box).stroke == colorOf("var(--mt-text-tertiary)") };
            // Standardknopf: nach dem Öffnen fokussiert, aber ohne Ring; per Tastatur mit Ring
            out.focus = { active: d.activeElement === btn, fv: btn.matches(":focus-visible"), outline: cs(btn).outlineStyle };
            // (Fenster nach vorn, sonst greift :focus-visible nicht)
            w.focus(); await until(() => Services.focus.activeWindow == w, 3000); await wait(200);
            btn.blur(); btn.focus({ focusVisible: true }); await wait(100);
            out.focus.kbFv = btn.matches(":focus-visible");
            out.focus.kbOutline = cs(btn).outlineStyle; out.focus.kbWidth = parseFloat(cs(btn).outlineWidth);
            btn.blur();
            // Statuskapsel: Text 13 px wie „Add Contact“, ohne Konto gedimmt wie die übrigen Knöpfe; flacher Punkt
            const lbl = d.getElementById("statusMessageLabel"), type = d.getElementById("statusTypeIcon"), ic = q("#statusTypeIcon > .toolbarbutton-icon");
            const addText = q("#button-add-buddy .toolbarbutton-text"), addIcon = q("#button-add-buddy .toolbarbutton-icon");
            const ir = ic.getBoundingClientRect(), sr = q("#chat-status-selector").getBoundingClientRect();
            out.status = { size: cs(lbl).fontSize, addSize: cs(addText).fontSize, disabled: type.hasAttribute("disabled"),
              lblOp: cs(lbl).opacity, addTextOp: cs(addText).opacity, dotOp: cs(ic).opacity, addIconOp: cs(addIcon).opacity,
              img: cs(ic).listStyleImage, w: ir.width, h: ir.height, mid: Math.abs((ir.top + ir.bottom) / 2 - (sr.top + sr.bottom) / 2),
              online: cs(ic).backgroundColor == colorOf("var(--mt-status-online)", "backgroundColor") };
            // Innenabstand der Kapsel links (bis zum Punkt) und rechts (hinter dem Textende) gleich
            // und wie bei „Add Contact“ (Symbol links, Text rechts)
            const textRight = el => { const r = d.createRange(); r.selectNodeContents(el); const rr = r.getBoundingClientRect();
              return rr.width > 0 ? rr.right : el.getBoundingClientRect().right - parseFloat(cs(el).paddingRight); };
            const ar = q("#button-add-buddy").getBoundingClientRect(), air = addIcon.getBoundingClientRect();
            Object.assign(out.status, { padL: ir.left - sr.left, padR: sr.right - textRight(lbl),
              addL: air.left - ar.left, addR: ar.right - textRight(addText), text: lbl.value || lbl.textContent });
            const st = type.getAttribute("status"); type.setAttribute("status", "away"); await wait(100);
            out.status.away = cs(ic).backgroundColor == colorOf("var(--mt-status-away)", "backgroundColor");
            type.setAttribute("status", st);
            // deaktivierte Knöpfe (ohne Konto) werden beim Überfahren nicht dunkler
            out.hover = {};
            for (const id of ["button-join-chat", "button-add-buddy"]) {
              const b = d.getElementById(id), base = cs(b).backgroundColor;
              InspectorUtils.addPseudoClassLock(b, ":hover");
              out.hover[id] = { disabled: b.hasAttribute("disabled"), same: cs(b).backgroundColor == base };
              InspectorUtils.clearPseudoClassLocks(b);
            }
            // Knöpfe an der Kante der Mailliste, solange Platz ist
            out.edge1500 = Math.round(d.getElementById("chat-view-toolbox").getBoundingClientRect().left);
            // langer Statustext endet mit „…“; Knöpfe und Suche überlappen bei keiner Fensterbreite
            gus.setStatus(Ci.imIStatusInfo.STATUS_AWAY, "I am currently away from the computer and will be back later. ".repeat(2));
            await wait(1500);
            out.long = { vb: Math.round(q("#chat-status-selector > vbox").getBoundingClientRect().width), to: cs(lbl).textOverflow, ox: cs(lbl).overflowX };
            out.widths = {};
            for (const W of [1500, 1280, 1150, 1000, 900]) {
              w.resizeTo(W, 900); await wait(1200);
              const tb = d.getElementById("chat-view-toolbox").getBoundingClientRect(), s = search(), lp = d.getElementById("listPaneBox").getBoundingClientRect();
              out.widths[W] = { win: w.outerWidth, tbl: Math.round(tb.left), tbr: Math.round(tb.right), sl: Math.round(s.left), lpr: Math.round(lp.right), inner: w.innerWidth };
            }
          } finally {
            gus.setStatus(Ci.imIStatusInfo.STATUS_AVAILABLE, "");
            w.resizeTo(1500, 900); await wait(800); await toMail();
          }
          return out;""")
        e, f, st, wd = res["empty"], res["focus"], res["status"], res["widths"]
        empty_ok = (e["inner"] == "1" and not e["dim"] and e["descSize"] == "13px" and e["descOk"] and e["btnOk"]
                    and e["icon"] and e["stroke"])
        focus_ok = f["active"] and not f["fv"] and f["outline"] == "none" and f["kbOutline"] != "none" and f["kbWidth"] >= 2
        status_ok = (st["size"] == "13px" == st["addSize"] and st["img"] == "none" and abs(st["w"] - 10) <= 0.5
                     and abs(st["h"] - 10) <= 0.5 and st["mid"] <= 1 and st["online"] and st["away"]
                     and abs(st["padL"] - st["padR"]) <= 3 and abs(st["padL"] - st["addL"]) <= 3
                     and (not st["disabled"] or (st["lblOp"] == st["addTextOp"] and st["dotOp"] == st["addIconOp"])))
        hover_ok = all(v["same"] for v in res["hover"].values() if v["disabled"])
        long_ok = res["long"]["vb"] <= 161 and res["long"]["to"] == "ellipsis" and res["long"]["ox"] == "hidden"
        widths_ok = all(v["tbr"] + 4 <= v["sl"] and v["tbl"] >= v["lpr"] and v["tbr"] <= v["inner"] for v in wd.values())
        # mit langem Statustext rücken die Knöpfe nur nach links, wenn die Suche schon auf ihre Mindestbreite
        # gekürzt ist (12 px Abstand) – mit breiteren Systemschriften (Linux) schon bei 1500 px
        edge_ok = (abs(wd["1500"]["tbl"] - res["edge1500"]) <= 1
                   or (wd["1500"]["tbl"] < res["edge1500"] and wd["1500"]["sl"] - wd["1500"]["tbr"] <= 13))
        ok = empty_ok and focus_ok and status_ok and hover_ok and long_ok and widths_ok and edge_ok
        return ok, f"{res}"
    check("Chat: leerer Zustand ruhig ohne Dauer-Fokusring, Statuskapsel 13 px mit flachem Punkt und beidseitig gleichem Innenabstand wie „Add Contact“, kein Hover auf deaktivierten Knöpfen, langer Statustext mit „…“, Knöpfe und Suche überlappen bei keiner Fensterbreite", chat_toolbar, results)

    def side_line():
        # Trennlinie der Seitenleiste läuft in der Toolbar-Zeile ohne Versatz und
        # ohne Farbsprung weiter: --mc-side-right ist die Außenkante samt der
        # 1-px-Linie der Seitenleiste, die Linie oben liegt auf dem letzten Pixel davor
        res = m.js(r"""
          const out = {};
          const pixels = async r => { const cv = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            cv.width = Math.round(r.width); cv.height = Math.round(r.height); const ctx = cv.getContext("2d");
            try { const bm = await w.browsingContext.currentWindowGlobal.drawSnapshot(new w.DOMRect(r.left, r.top, r.width, r.height), 1, "white"); ctx.drawImage(bm, 0, 0); }
            catch { ctx.drawWindow(w, r.left, r.top, r.width, r.height, "white"); }
            const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
            return (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; }; };
          try {
            w.resizeTo(1500, 900); await wait(800);
            for (const [mode, id] of [["chat", "listPaneBox"], ["calendar", "calSidebar"]]) {
              tm.openTab(mode, {}); await wait(1500);
              const rowEl = d.getElementById("unifiedToolbarContainer"), row = rowEl.getBoundingClientRect();
              const side = parseFloat(w.getComputedStyle(rowEl).getPropertyValue("--mc-side-right"));
              const paneEl = d.getElementById(id), pane = paneEl.getBoundingClientRect();
              const bg = w.getComputedStyle(rowEl).backgroundImage;
              // je ein Bildpunkt links von, auf und rechts von der Linie, über und unter der Toolbar-Kante
              const px = await pixels(new w.DOMRect(Math.round(pane.right) - 3, row.bottom - 4, 5, 8));
              const col = x => ({ up: px(x, 1), down: px(x, 6) });
              out[mode] = { off: row.left + side - pane.right, border: w.getComputedStyle(paneEl).borderInlineEndWidth,
                layers: (bg.match(/linear-gradient/g) || []).length, cols: [col(1), col(2), col(3)] };
            }
          } finally {
            await toMail();
          }
          return out;""")
        def same(a, b):
            return all(abs(x - y) <= 6 for x, y in zip(a, b))
        ok = all(v["border"] == "1px" and abs(v["off"]) <= 0.5 and v["layers"] == 2
                 and all(same(c["up"], c["down"]) for c in v["cols"]) for v in res.values())
        return ok, f"{res}"
    check("Bereiche: Trennlinie der Seitenleiste läuft in der Toolbar-Zeile ohne Versatz und Farbsprung weiter (Chat, Kalender)", side_line, results)

    def today_closed():
        # Today-Pane aus: keine graue Fläche oben rechts neben dem Knopf
        res = m.js('''
          await toMail(); await wait(800);
          const row = d.getElementById("unifiedToolbarContainer"); const top = d.getElementById("mcTodayTop");
          const cmd = d.getElementById("calendar_toggle_todaypane_command");
          const was = w.TodayPane?.isVisible;
          // erst offen (Fläche da), dann zu (Fläche weg), dann wie vorher
          if (!was) { cmd.doCommand(); await wait(800); }
          const out = { open: !row.hasAttribute("data-mc-tp-none") && Math.round(top.getBoundingClientRect().width) > 0 };
          cmd.doCommand(); await wait(800);
          out.none = row.hasAttribute("data-mc-tp-none"); out.width = Math.round(top.getBoundingClientRect().width);
          if (was) { cmd.doCommand(); await wait(800); }
          return out;''')
        return res["open"] and res["none"] and res["width"] == 0, f"{res}"
    check("Today-Pane aus: keine Fläche rechts neben dem Knopf", today_closed, results)

    def statusbar():
        # kein Today-Pane-Knopf mehr unten rechts (das Symbol oben übernimmt
        # weiter dessen Tageszahl); Leiste flach, Grau der Seitenleiste läuft
        # durch, Text beginnt rechts der Ordnerliste
        res = m.js('''
          await toMail(); await wait(800);
          const sb = d.getElementById("status-bar"), cs = getComputedStyle(sb);
          const a3 = tm.currentAbout3Pane, fp = a3.document.getElementById("folderPane").getBoundingClientRect();
          const sidebarRight = tm.currentTabInfo.chromeBrowser.getBoundingClientRect().left + fp.right;
          const panel = d.getElementById("calendar-show-todaypane-panel");
          const text = d.getElementById("statusTextBox").getBoundingClientRect();
          return { panel: panel ? getComputedStyle(panel).display : "fehlt",
                   day: d.querySelector("#mcTodayToggle .mc-today-day")?.textContent,
                   height: Math.round(sb.getBoundingClientRect().height), font: cs.fontSize,
                   textLeft: Math.round(text.left), sidebarRight: Math.round(sidebarRight),
                   bg: cs.backgroundImage.includes("gradient") };''')
        ok = (res["panel"] in ("none", "fehlt") and res["day"] and res["height"] <= 24 and res["font"] == "11px"
              and res["bg"] and res["textLeft"] >= res["sidebarRight"])
        return ok, f"{res}"
    check("Statusleiste: ohne Today-Pane-Knopf, flach, Seitenleiste läuft durch", statusbar, results)

    def statusbar_edges():
        # Online-Symbol der Statusleiste in jedem Bereich rechts der Seitenleiste wie in der Mail; mit ausgeblendeter
        # Bereiche-Leiste (und Seitenleiste) nie unter dem Knopf zum Einblenden
        res = m.js(r"""
          const R = e => { const r = e?.getBoundingClientRect(); return r?.width ? { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } : null; };
          const wlan = () => R(d.getElementById("offline-status"));
          const a3 = await toMail(); await wait(800);
          const out = { mail: { wlan: wlan(), side: R(a3.document.getElementById("folderPane")) } };
          await toCalendar(); await wait(800); out.calendar = { wlan: wlan(), side: R(d.getElementById("calSidebar")) };
          const spaces = w.gSpacesToolbar;
          try {
            spaces.toggleToolbar(true); await wait(1500);
            out.hidden = { wlan: wlan(), side: R(d.getElementById("calSidebar")) };
            d.getElementById("spacesPinnedButton").click(); await wait(1200);
            out.hiddenNoSide = { wlan: wlan(), toggle: R(d.getElementById("mcSpacesToggle")) };
            d.getElementById("spacesPinnedButton").click(); await wait(1200);
          } finally { spaces.toggleToolbar(false); await wait(1200); await toMail(); }
          return out;""")
        bad = []
        for area in ("mail", "calendar", "hidden"):
            v = res.get(area) or {}
            if not v.get("wlan") or not v.get("side") or v["wlan"]["l"] < v["side"]["r"] + 6:
                bad.append(area)
        h = res.get("hiddenNoSide") or {}
        if not h.get("wlan") or (h.get("toggle") and h["toggle"]["b"] > h["wlan"]["t"] and h["wlan"]["l"] < h["toggle"]["r"] + 4):
            bad.append("ohne Bereiche und Seitenleiste")
        return not bad, f"{bad} {res}"
    check("Statusleiste: Online-Symbol in jedem Bereich rechts der Seitenleiste, nie unter dem Knopf zum Einblenden der Bereiche", statusbar_edges, results)

    def no_new_tab_items():
        # Kontextmenüs ohne „In neuem Tab/Fenster öffnen“ in allen Bereichen; keine doppelten oder Rand-Trennlinien
        res = m.js(r"""
          const a3 = await toMail(); await wait(600); const ad = a3.document;
          const vis = el => !!el && el.getBoundingClientRect().height > 0;
          const look = p => { const kids = [...p.children].filter(vis); const ids = kids.map(k => k.localName == "menuseparator" ? "|" : (k.id || k.label || k.localName));
            return { bad: kids.filter(k => /new(tab|window)|openinwindow/i.test(k.id)).map(k => k.id),
                     seps: ids[0] == "|" || ids.at(-1) == "|" || ids.some((x, i) => x == "|" && ids[i + 1] == "|"), count: kids.length, ids: ids.join(" ") }; };
          const openAt = async (p, el) => { const r = el.getBoundingClientRect(), v = el.ownerDocument.defaultView;
            el.dispatchEvent(new v.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: r.left + 10, clientY: r.top + r.height / 2,
              screenX: v.mozInnerScreenX + r.left + 10, screenY: v.mozInnerScreenY + r.top + r.height / 2 }));
            await until(() => p.state == "open", 2000); await wait(300); const out = look(p); p.hidePopup(); await wait(300); return out; };
          const out = {};
          const folderRow = [...ad.querySelectorAll('#folderTree li[is="folder-tree-row"]')].find(li => li.querySelector(".name")?.getBoundingClientRect().width && !li.dataset.serverType);
          if (folderRow) out.folder = await openAt(ad.getElementById("folderPaneContext"), folderRow.querySelector(".container"));
          const tab = d.getElementById("tabmail").tabContainer.allTabs[0];
          out.tab = await openAt(d.getElementById("tabContextMenu"), tab);
          const space = d.getElementById("calendarButton");
          const sp = d.getElementById("spacesContextMenu");
          if (space && sp) { space.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })); await wait(500);
            out.spaces = { state: sp.state, ...look(sp) }; sp.hidePopup(); await wait(300); }
          return out;""")
        bad = [k for k, v in res.items() if v and (v.get("bad") or v.get("seps"))]
        return not bad and "folder" in res and "tab" in res, f"{bad} {res}"
    check("Kontextmenüs: ohne „In neuem Tab/Fenster öffnen“, ohne doppelte Trennlinien", no_new_tab_items, results)

    def task_filter_menu():
        # Aufgaben: Filter als Menü hinter dem Filter-Knopf im Listenkopf (neben „…“) statt Liste in der Seitenleiste
        res = m.js(r"""
          tm.openTab("tasks", {}); await wait(1500);
          const group = d.getElementById("task-tree-filtergroup"), before = group.value;
          const btn = d.querySelector("#mcListHeader .mc-lh-filter"), popup = d.getElementById("mcTaskFilterPopup");
          const vis = el => !!el && el.getBoundingClientRect().width > 0;
          const out = { button: vis(btn), sidebarList: vis(d.getElementById("task-filtertree-pane")) || vis(d.getElementById("task-tree-filter-header")),
                        leftOfMore: btn && Math.round(d.querySelector("#mcListHeader .mc-lh-more").getBoundingClientRect().left - btn.getBoundingClientRect().right) };
          btn?.click(); await until(() => popup?.state == "open", 2000); await wait(300);
          const entries = [...(popup?.children || [])].filter(i => i.getAttribute("name") == "mctaskfilter");
          out.items = entries.length; out.checked = entries.filter(i => i.getAttribute("checked") == "true").length;
          const today = entries.find(i => /today/i.test(i.getAttribute("label")));
          popup?.activateItem?.(today) ?? today?.doCommand(); await wait(500); popup?.hidePopup(); await wait(200);
          const tree = d.getElementById("calendar-task-tree");
          out.value = group.value; out.tree = tree.getAttribute("filterValue"); out.active = btn?.getAttribute("aria-pressed") == "true";
          // zurück über das Menü – die Liste muss dem Filter folgen
          btn?.click(); await until(() => popup?.state == "open", 2000); await wait(200);
          const curItem = [...popup.children].find(i => /current/i.test(i.getAttribute("label")));
          popup?.activateItem?.(curItem) ?? curItem?.doCommand(); await wait(500); popup?.hidePopup(); await wait(200);
          out.back = [group.value, tree.getAttribute("filterValue")]; out.activeCurrent = btn?.getAttribute("aria-pressed") == "true";
          out.title = d.querySelector("#mcListHeader .mc-lh-title").textContent;
          if (before && before != "throughcurrent") w.taskViewUpdate(before);
          for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          await toMail(); out.inMail = !!d.getElementById("mcTaskFilterPopup") && d.getElementById("mcTaskFilterPopup").state == "open";
          return out;""")
        ok = (res["button"] and not res["sidebarList"] and res["leftOfMore"] is not None and -1 <= res["leftOfMore"] <= 2
              and res["items"] == 8 and res["checked"] == 1 and res["value"] == "throughtoday" and res["tree"] == "throughtoday" and res["active"]
              and res["back"] == ["throughcurrent", "throughcurrent"] and not res["activeCurrent"]
              and not res["inMail"])
        return ok, f"{res}"
    check("Aufgaben: Filter als Menü hinter dem Filter-Knopf im Listenkopf (wie in der Mail) statt Liste in der Seitenleiste", task_filter_menu, results)

    def today_plus_event():
        # „+“ ganz rechts → „New Event“: Schnellfenster ganz auf dem Bildschirm
        # (früher mittig unter dem „+“ geöffnet und von Thunderbird am Rand auf
        # 224 statt 380 px zusammengedrückt)
        res = m.js('''
          await toMail(); const sx = w.screenX, sy = w.screenY, sw = w.outerWidth, sh = w.outerHeight;
          const right = w.screen.availLeft + w.screen.availWidth;
          w.moveTo(right - 1300, w.screen.availTop); w.resizeTo(1300, 900); await wait(1200);
          if (!w.TodayPane.isVisible) { d.getElementById("mcTodayToggle").click(); await wait(800); }
          const out = { visibility: d.visibilityState, screenRight: right };
          for (const id of ["mcNewEvent", "mcNewTask"]) {
            d.getElementById("mcTodayNew").click(); await until(() => d.getElementById("mcNewPopup").state == "open", 3000);
            d.getElementById(id).click();
            const qp = d.getElementById("mcQuickPanel"); await until(() => qp.state == "open", 3000); await wait(400);
            const r = qp.getOuterScreenRect();
            out[id] = { state: qp.state, mode: qp.querySelector(".mc-qc-seg > button[selected]")?.dataset.mode, width: Math.round(r.width), right: Math.round(r.left + r.width) };
            qp.hidePopup(); await until(() => qp.state == "closed", 2000);
          }
          w.moveTo(sx, sy); w.resizeTo(sw, sh); await wait(800);
          return out;''')
        panels = [res["mcNewEvent"], res["mcNewTask"]]
        if any(p["state"] != "open" for p in panels) and res["visibility"] == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        modes = res["mcNewEvent"]["mode"] == "event" and res["mcNewTask"]["mode"] == "task"
        return modes and all(p["width"] >= 370 and p["right"] <= res["screenRight"] for p in panels), f"{res}"
    check("Today-Pane: „+“ → Neuer Termin / Neue Aufgabe ganz auf dem Bildschirm", today_plus_event, results)

    def today_animation():
        res = m.js('''
          await toMail(); await wait(1500);
          const panel = d.getElementById("today-pane-panel"); const btn = d.getElementById("mcTodayToggle");
          const record = async () => { const ws = [], ts = []; const t0 = performance.now(); while (performance.now() - t0 < 600) { ws.push(Math.round(panel.getBoundingClientRect().width)); ts.push(performance.now()); await new Promise(r => w.requestAnimationFrame(r)); } return { ws, ts }; };
          const out = { start: Math.round(panel.getBoundingClientRect().width), animating: !!panel.__mcAnimating, tpVisible: w.TodayPane?.isVisible, tab: d.documentElement.getAttribute("mc-tab"), popups: [...d.querySelectorAll("panel, menupopup")].filter(p => p.state == "open").map(p => p.id) };
          if (!out.start) return { skipped: true };
          const errs = []; const onErr = e => errs.push(String(e.message || e.error).slice(0, 200)); w.addEventListener("error", onErr);
          const cons = []; const listener = { observe: m => { if (m instanceof Ci.nsIScriptError && /implementation\\.js/.test(m.sourceName)) cons.push(m.errorMessage.slice(0, 200) + " @" + m.lineNumber); } };
          Services.console.registerListener(listener);
          out.errs = errs; out.cons = cons; out.visibility = d.visibilityState;
          // Bildtakt ohne Animation als Maßstab (60 oder 120 Hz)
          const idle = []; const tIdle = performance.now(); let tPrev = tIdle;
          while (performance.now() - tIdle < 300 || idle.length < 2) { await new Promise(r => w.requestAnimationFrame(r)); const t = performance.now(); idle.push(t - tPrev); tPrev = t; if (idle.length > 60) break; }
          out.idleFrameMs = Math.round(idle.sort((a, b) => a - b)[idle.length >> 1]);
          for (const phase of ["aus", "ein"]) {
            btn.click(); const { ws, ts } = await record(); await wait(300);
            // nur Bilder, in denen sich die Breite ändert (die Animation selbst)
            const moving = ws.map((v, i) => i > 0 && v != ws[i - 1]);
            const dts = ts.slice(1).map((t, i) => t - ts[i]).filter((_, i) => moving[i + 1]);
            const jumps = ws.slice(1).map((v, i) => Math.abs(v - ws[i]));
            out[phase] = { steps: moving.filter(Boolean).length + 1, maxJump: Math.max(...jumps), maxFrameMs: Math.round(Math.max(...dts)), medianFrameMs: Math.round(dts.sort((a, b) => a - b)[dts.length >> 1] || 0) };
          }
          out.end = Math.round(panel.getBoundingClientRect().width);
          w.removeEventListener("error", onErr); Services.console.unregisterListener(listener);
          return out;''')
        if res.get("skipped"):
            return True, "Today-Pane zu – übersprungen"
        if res.get("visibility") == "hidden" and all(res[p]["steps"] <= 1 for p in ("aus", "ein")):
            # macOS pausiert Bildschritte in verdeckten Fenstern – kein Fehler der Animation
            return True, "Testfenster verdeckt – übersprungen"
        # flüssig: viele Zwischenschritte, kein Sprung über die halbe Breite und
        # Bilder im normalen Takt – früher ordnete jedes Bild den ganzen
        # Mailbereich neu an (20–35 ms statt 8 ms bei 120 Hz); Maßstab höchstens
        # 60 Hz, falls das Fenster beim Messen des Leerlaufs verdeckt war
        ok = all(res[p]["steps"] >= 6 and res[p]["maxJump"] < res["start"] / 2 and
                 res[p]["medianFrameMs"] <= min(res["idleFrameMs"], 17) * 1.5 + 2 for p in ("aus", "ein")) and res["end"] == res["start"]
        return ok, f"{res}"
    check("Today-Pane: Ein-/Ausblenden flüssig (kein Sprung)", today_animation, results)

    def drag_hide():
        # Trennlinien zuziehen: Kalender-Seitenleiste verschwindet schon beim Ziehen (ohne Animation) und kommt mit der
        # alten Breite wieder; Mail ohne Thunderbirds blauen Balken an der zugeklappten Trennlinie; Today-Pane fest
        # 280 px, nach rechts gezogen sofort aus, „+“ gleich weg (auch beim Klick auf den Knopf); Spaces-Knopf bleibt
        # stehen und wechselt nur den Pfeil
        V = lambda r: r["value"] if isinstance(r, dict) and "value" in r else r
        def drag(x, y, dx, release=True):
            steps = [{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}]
            steps += [{"type": "pointerMove", "x": x + dx * i // 10, "y": y, "origin": "viewport", "duration": 15} for i in range(1, 11)]
            m.cmd("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "maus", "parameters": {"pointerType": "mouse"}, "actions": steps}]})
        def release():
            m.cmd("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "maus", "parameters": {"pointerType": "mouse"}, "actions": [{"type": "pointerUp", "button": 0}]}]})
            m.cmd("WebDriver:ReleaseActions", {})
        out = {}
        # Kalender
        p = m.js(r"""w.resizeTo(1400, 900); await wait(500); await toCalendar(); await wait(1000);
          const sb = d.getElementById("calSidebar"), sp = d.getElementById("calsidebar_splitter"); const r = sp.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 300), w: Math.round(sb.getBoundingClientRect().width), hidden: sb.classList.contains("mc-side-hidden") };""")
        if p.get("hidden"):
            m.js('d.getElementById("spacesPinnedButton").click(); await wait(800); return 1;')
        drag(p["x"], p["y"], -(p["w"] - 60))
        out["calDuring"] = m.js('return d.getElementById("calSidebar").classList.contains("mc-side-hidden");')
        release(); time.sleep(0.5)
        out["calShown"] = m.js(r"""d.getElementById("spacesPinnedButton").click(); await wait(900);
          const sb = d.getElementById("calSidebar"); return [sb.classList.contains("mc-side-hidden"), Math.round(sb.getBoundingClientRect().width)];""")
        out["calWidth"] = p["w"]
        # Mail: Balken an der zugeklappten Trennlinie
        out["mailBar"] = m.js(r"""const a3 = await toMail(); const sp = a3.document.getElementById("folderPaneSplitter");
          return a3.getComputedStyle(sp, "::after").display;""")
        # Today-Pane
        t = m.js(r"""await toMail(); await wait(500); const panel = d.getElementById("today-pane-panel");
          if (!w.TodayPane?.isVisible) { d.getElementById("mcTodayToggle").click(); await wait(900); }
          const sp = d.getElementById("today-splitter").getBoundingClientRect(); const row = d.getElementById("unifiedToolbarContainer");
          return { x: Math.round(sp.left + sp.width / 2), y: Math.round(sp.top + 300), w: Math.round(panel.getBoundingClientRect().width), plus: row.hasAttribute("data-mc-tp-open") };""")
        out["todayWidth"], out["plusBefore"] = t["w"], t["plus"]
        drag(t["x"], t["y"], 80)
        out["todayDuring"] = m.js('return [!!w.TodayPane?.isVisible, d.getElementById("unifiedToolbarContainer").hasAttribute("data-mc-tp-open")];')
        release(); time.sleep(0.5)
        out["todayClick"] = m.js(r"""const btn = d.getElementById("mcTodayToggle"), row = d.getElementById("unifiedToolbarContainer");
          btn.click(); await wait(900); const open = [!!w.TodayPane?.isVisible, row.hasAttribute("data-mc-tp-open"), Math.round(d.getElementById("today-pane-panel").getBoundingClientRect().width)];
          btn.click(); const right = row.hasAttribute("data-mc-tp-open"); await wait(900);
          btn.click(); await wait(900); return { open, plusAtStart: right };""")
        # Spaces-Knopf
        out["spaces"] = m.js(r"""const b = d.getElementById("mcSpacesToggle"); const L = () => Math.round(b.getBoundingClientRect().left * 2) / 2;
          const r = { before: [L(), b.hasAttribute("data-mc-hidden")] }; b.click(); await wait(20);
          r.click = [L(), b.hasAttribute("data-mc-hidden")]; await wait(80); r.mid = L(); await wait(700);
          r.after = [L(), b.hasAttribute("data-mc-hidden"), !!w.gSpacesToolbar.isHidden]; b.click(); await wait(20);
          r.back = b.hasAttribute("data-mc-hidden"); await wait(800); r.end = [L(), !!w.gSpacesToolbar.isHidden]; return r;""")
        c, s_ = out["todayClick"], out["spaces"]
        ok = (out["calDuring"] is True and out["calShown"][0] is False and abs(out["calShown"][1] - out["calWidth"]) <= 2
              and out["mailBar"] == "none"
              and out["todayWidth"] == 280 and out["plusBefore"] and out["todayDuring"] == [False, False]
              and c["open"] == [True, True, 280] and c["plusAtStart"] is False
              and s_["before"][1] is False and s_["click"] == [s_["before"][0], True] and s_["mid"] == s_["before"][0]
              and s_["after"] == [s_["before"][0], True, True] and s_["back"] is False and s_["end"] == [s_["before"][0], False])
        return ok, f"{out}"
    check("Trennlinien: Seitenleiste beim Zuziehen sofort weg, kein blauer Balken, Today-Pane fest 280 px und nach rechts gezogen sofort aus, „+“ gleich weg, Spaces-Knopf bleibt stehen", drag_hide, results)

    def drag_reshow():
        # Eine Zieh-Logik für alle Bereiche: Seitenleiste (Kalender, Mail, Adressbuch, Einstellungen) bis zur gemeinsamen
        # Höchstbreite ziehbar (Mail wird breiter), unter der Schwelle sofort aus, im selben Zug zurück wieder da;
        # ausgeblendet bleibt links eine Greifzone, an der man sie herauszieht; Today-Pane gespiegelt am rechten Rand;
        # alles ohne Animation
        def act(steps):
            m.cmd("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "maus", "parameters": {"pointerType": "mouse"}, "actions": steps}]})
        def down(x, y):
            act([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}])
        def move(x0, x1, y, n=8):
            act([{"type": "pointerMove", "x": x0 + (x1 - x0) * i // n, "y": y, "origin": "viewport", "duration": 15} for i in range(1, n + 1)])
        def up():
            act([{"type": "pointerUp", "button": 0}])
            m.cmd("WebDriver:ReleaseActions", {})
        # Zustand: hidden, Breite, Trennlinie (x, y), Greifzone (sichtbar, x), animiert?
        cal_js = r"""const sb = d.getElementById("calSidebar"), sp = d.getElementById("calsidebar_splitter").getBoundingClientRect(), g = d.getElementById("mcSideGrip");
          return { hidden: sb.classList.contains("mc-side-hidden"), w: Math.round(sb.getBoundingClientRect().width), x: Math.round(sp.left + sp.width / 2), y: Math.round(sp.top + 300),
            grip: !!g && g.style.display != "none", gx: g ? Math.round(g.getBoundingClientRect().left + 2) : 0, left: Math.round(d.getElementById("calendarContent").getBoundingClientRect().left),
            anim: sb.classList.contains("mc-side-anim"), max: parseFloat(getComputedStyle(sb).getPropertyValue("--mt-sidebar-max-width")) };"""
        mail_js = r"""const a3 = tm.currentAbout3Pane, ad = a3.document, off = a3.browsingContext.embedderElement.getBoundingClientRect(); const sp = ad.getElementById("folderPaneSplitter"), r = sp.getBoundingClientRect(), g = ad.getElementById("mcSideGrip");
          return { hidden: sp.isCollapsed, w: Math.round(ad.getElementById("folderPane").getBoundingClientRect().width), x: Math.round(off.left + r.left + r.width / 2), y: Math.round(off.top + 300),
            grip: !!g && g.style.display != "none", gx: g ? Math.round(off.left + g.getBoundingClientRect().left + 2) : 0, left: Math.round(off.left), anim: !!a3.__mcAnimating };"""
        ab_js = r"""const b = tm.currentTabInfo.browser, ad = b.contentDocument, off = b.getBoundingClientRect(); const bp = ad.getElementById("booksPane"), sp = ad.getElementById("booksSplitter").getBoundingClientRect(), g = ad.getElementById("mcSideGrip");
          return { hidden: bp.classList.contains("mc-side-hidden"), w: Math.round(bp.getBoundingClientRect().width), x: Math.round(off.left + sp.left + sp.width / 2), y: Math.round(off.top + 300),
            grip: !!g && g.style.display != "none", gx: g ? Math.round(off.left + g.getBoundingClientRect().left + 2) : 0, left: Math.round(off.left), anim: bp.classList.contains("mc-side-anim") };"""
        pref_js = r"""const b = tm.currentTabInfo.browser, pd = b.contentDocument, off = b.getBoundingClientRect(); const box = pd.getElementById("pref-category-box"), g = pd.getElementById("mcSideGrip");
          return { hidden: box.classList.contains("mc-side-hidden"), w: Math.round(box.getBoundingClientRect().width), y: Math.round(off.top + 300),
            grip: !!g && g.style.display != "none", gx: g ? Math.round(off.left + g.getBoundingClientRect().left + 2) : 0, left: Math.round(off.left), anim: box.classList.contains("mc-side-anim") };"""
        today_js = r"""const p = d.getElementById("today-pane-panel"), sp = d.getElementById("today-splitter").getBoundingClientRect(), g = d.getElementById("mcTodayGrip");
          return { hidden: !w.TodayPane?.isVisible, w: Math.round(p.getBoundingClientRect().width), x: Math.round(sp.left + sp.width / 2), y: Math.round(sp.top + 300),
            grip: g.style.display != "none", gx: Math.round(g.getBoundingClientRect().left + 2), right: Math.round(d.getElementById("tabmail-container").getBoundingClientRect().right), anim: !!p.__mcAnimating };"""
        out, bad = {}, []
        def side(name, state, widen):
            # breiter ziehen, ganz nach rechts (Höchstbreite), nach links (aus), zurück (ein), wieder aus und loslassen,
            # dann an der Greifzone herausziehen
            s = m.js(state)
            if s["hidden"]:
                bad.append(f"{name}: anfangs ausgeblendet")
                return
            r = {"start": s["w"]}
            x, y = s["x"], s["y"]
            down(x, y)
            if widen:
                move(x, x + 60, y)
                r["wider"] = m.js(state)["w"]
                move(x + 60, x + 500, y)
                r["max"] = m.js(state)["w"]
                x += 500
            move(x, s["left"] + 40, y)
            mid = m.js(state)
            r["off"] = [mid["hidden"], mid["anim"]]
            move(s["left"] + 40, s["left"] + 240, y)
            mid = m.js(state)
            r["on"] = [mid["hidden"], mid["anim"], mid["w"]]
            move(s["left"] + 240, s["left"] + 20, y)
            up()
            time.sleep(0.4)
            e = m.js(state)
            r["released"] = [e["hidden"], e["grip"], e["gx"] - e["left"]]
            down(e["gx"], y)
            move(e["gx"], e["gx"] + 250, y)
            up()
            time.sleep(0.4)
            e = m.js(state)
            r["grip"] = [e["hidden"], e["grip"], e["anim"]]
            out[name] = r
            if r["off"] != [True, False] or r["on"][:2] != [False, False] or abs(r["on"][2] - 240) > 30:
                bad.append(f"{name}: im selben Zug {r['off']} / {r['on']}")
            if r["released"][:2] != [True, True] or not 0 <= r["released"][2] <= 6:
                bad.append(f"{name}: Greifzone {r['released']}")
            if r["grip"] != [False, s["grip"], False]:
                bad.append(f"{name}: herausgezogen {r['grip']}")
            # (Windows: Fensterknöpfe in der Toolbar – in 1400 px stößt die Ordnerliste etwas früher an die Grenze)
            if widen and (r["wider"] < r["start"] + 40 or not (r["max"] == 360 or (sys.platform == "win32" and 340 <= r["max"] <= 360))):
                bad.append(f"{name}: Breite {r['start']} → {r['wider']} → {r['max']} (Höchstbreite 360)")
        m.js('w.resizeTo(1400, 900); await wait(500); await toCalendar(); await wait(800); return 1;')
        out["max"] = m.js(cal_js)["max"]
        if out["max"] != 360:
            bad.append(f"--mt-sidebar-max-width {out['max']}")
        side("Kalender", cal_js, True)
        m.js('await toMail(); await wait(500); return 1;')
        side("Mail", mail_js, True)
        m.js('tm.openTab("addressBookTab", {}); await wait(2000); return 1;')
        side("Adressbuch", ab_js, False)
        # Einstellungen: feste Breite, keine eigene Trennlinie – die Greifzone sitzt am rechten Rand der Leiste
        m.js('w.openPreferencesTab(); await wait(2000); return 1;')
        s = m.js(pref_js)
        r = {"start": [s["hidden"], s["w"], s["grip"]]}
        x, y = s["gx"], s["y"]
        down(x, y)
        move(x, x - 180, y)
        r["off"] = m.js(pref_js)["hidden"]
        move(x - 180, x, y)
        r["on"] = m.js(pref_js)["hidden"]
        move(x, x - 200, y)
        up()
        time.sleep(0.4)
        e = m.js(pref_js)
        r["released"] = [e["hidden"], e["grip"], e["gx"] - e["left"]]
        down(e["gx"], y)
        move(e["gx"], e["gx"] + 200, y)
        up()
        time.sleep(0.4)
        e = m.js(pref_js)
        r["grip"] = [e["hidden"], e["w"], e["anim"]]
        out["Einstellungen"] = r
        if not (r["start"][0] is False and r["start"][2] and r["off"] is True and r["on"] is False and r["released"][:2] == [True, True]
                and 0 <= r["released"][2] <= 6 and r["grip"] == [False, s["w"], False]):
            bad.append(f"Einstellungen: {r}")
        # Today-Pane (gespiegelt): nach rechts aus, zurück ein, ausgeblendet am rechten Rand herausziehen
        m.js('await toMail(); await wait(500); if (!w.TodayPane?.isVisible) { d.getElementById("mcTodayToggle").click(); await wait(900); } return 1;')
        s = m.js(today_js)
        r = {}
        x, y = s["x"], s["y"]
        down(x, y)
        move(x, x + 40, y)
        mid = m.js(today_js)
        r["off"] = [mid["hidden"], mid["anim"], mid["grip"]]
        move(x + 40, x - 20, y)
        mid = m.js(today_js)
        r["on"] = [mid["hidden"], mid["anim"], mid["w"]]
        move(x - 20, x + 60, y)
        up()
        time.sleep(0.4)
        e = m.js(today_js)
        r["released"] = [e["hidden"], e["grip"], e["right"] - e["gx"]]
        down(e["gx"], y)
        move(e["gx"], e["gx"] - 60, y)
        up()
        time.sleep(0.4)
        e = m.js(today_js)
        r["grip"] = [e["hidden"], e["grip"], e["anim"], e["w"]]
        out["Today"] = r
        if not (r["off"] == [True, False, True] and r["on"] == [False, False, 280] and r["released"][:2] == [True, True]
                and 0 < r["released"][2] <= 6 and r["grip"] == [False, False, False, 280]):
            bad.append(f"Today-Pane: {r}")
        # gemeinsame Breite zurück auf den Standard (Doppelklick auf die Trennlinie der Mail)
        x, y = m.js(r"""const a3 = await toMail(); const off = a3.browsingContext.embedderElement.getBoundingClientRect(), s = a3.document.getElementById("folderPaneSplitter").getBoundingClientRect();
          return [Math.round(off.left + s.left + s.width / 2), Math.round(off.top + 300)];""")
        act([{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0},
             {"type": "pause", "duration": 80}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}])
        m.cmd("WebDriver:ReleaseActions", {})
        time.sleep(1)
        return not bad, "; ".join(bad) or f"{out}"
    check("Trennlinien: Seitenleisten aller Bereiche und Today-Pane bis zur gemeinsamen Höchstbreite ziehbar, im selben Zug wieder ein, ausgeblendet am Rand wieder herausziehbar, ohne Animation", drag_reshow, results)

    def sidebar_animation():
        # Seitenleiste ein-/ausblenden in Mail, Chat und Einstellungen gleich flüssig: Breite in vielen Zwischenschritten,
        # Knopf vorher und nachher an derselben Stelle, in der Mail bleibt die Liste stehen (kein Neuumbruch der Karten)
        res = m.js(r'''
          const btn = d.getElementById("spacesPinnedButton");
          const out = { visibility: d.visibilityState };
          const record = async (el, extra) => { const ws = [], xs = []; const t0 = performance.now();
            while (performance.now() - t0 < 650) { ws.push(Math.round(el.getBoundingClientRect().width)); if (extra) xs.push(Math.round(extra().width)); await new Promise(r => w.requestAnimationFrame(r)); }
            return { ws, xs }; };
          const measure = async (name, el, extra) => {
            const before = Math.round(btn.getBoundingClientRect().left), r = {};
            for (const phase of ["aus", "ein"]) {
              btn.click(); const { ws, xs } = await record(el(), extra); await wait(400);
              const distinct = new Set(ws).size;
              r[phase] = { steps: distinct, first: ws[0], last: ws[ws.length - 1], listRange: xs.length ? Math.max(...xs) - Math.min(...xs) : null };
            }
            r.button = [before, Math.round(btn.getBoundingClientRect().left)];
            out[name] = r;
          };
          const a3 = await toMail(); await wait(800);
          await measure("mail", () => a3.document.getElementById("folderPane"), () => a3.document.getElementById("threadPane").getBoundingClientRect());
          tm.openTab("chat", {}); await wait(1500);
          await measure("chat", () => d.getElementById("listPaneBox"));
          w.openPreferencesTab("paneGeneral"); await wait(2000);
          const pd = tm.currentTabInfo.browser.contentDocument;
          await measure("settings", () => pd.getElementById("pref-category-box"));
          // Adressbuch: Bücherliste nie breiter als ihre Rasterspalte (sonst ragt sie als grauer Balken über die Kontakte)
          tm.openTab("addressBookTab", {}); await wait(2500);
          const abd = tm.currentTabInfo.browser.contentDocument, bp = abd.getElementById("booksPane");
          let over = 0; const watch = () => { const col = parseFloat(abd.defaultView.getComputedStyle(abd.body).gridTemplateColumns) || 0;
            if (bp.classList.contains("mc-side-anim")) over = Math.max(over, Math.round(bp.getBoundingClientRect().width - col)); };
          const ro = new abd.defaultView.ResizeObserver(watch); ro.observe(bp); ro.observe(abd.body);
          await measure("addressbook", () => bp);
          ro.disconnect(); out.addressbook.overflow = over;
          for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          await toMail();
          return out;''')
        if res.get("visibility") == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        bad = []
        if (res.get("addressbook") or {}).get("overflow", 99) > 2:
            bad.append(f"Adressbuch: Bücherliste ragt {res['addressbook']['overflow']} px über ihre Spalte")
        for area in ("mail", "chat", "settings", "addressbook"):
            r = res.get(area) or {}
            for phase in ("aus", "ein"):
                p = r.get(phase) or {}
                if p.get("steps", 0) < 5:
                    bad.append(f"{area}/{phase}: {p.get('steps')} Schritte")
            if r.get("button") and abs(r["button"][0] - r["button"][1]) > 1:
                bad.append(f"{area}: Knopf {r['button']}")
        lr = [res["mail"][p]["listRange"] for p in ("aus", "ein")]
        if any(v is None or v > 2 for v in lr):
            bad.append(f"Mailliste ändert Breite {lr}")
        return not bad, f"{bad} {res}"
    check("Seitenleiste: Ein-/Ausblenden in Mail, Chat, Einstellungen und Adressbuch gleich flüssig, Knopf bleibt stehen, Mailliste behält ihre Breite, kein grauer Balken", sidebar_animation, results)


    def motion():
        # Bewegung wie Apple Mail: gelöschte Karte gleitet weg, bevor Thunderbird sie entfernt; Kalenderansicht blendet
        # beim Wechsel ein; Listen mit kurzem Übergang. „Bewegung reduzieren“ (ui.prefersReducedMotion): sofort, ohne
        # Gleiten, Übergänge 1 ms
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Bewegung")) { root.createSubfolder("Bewegung", null); await wait(800); }
          const f = root.getChildNamed("Bewegung"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          for (let i = f.getTotalMessages(false); i < 4; i++)
            lf.addMessage(`From: Halo <h@example.invalid>\r\nSubject: Bewegung ${i}\r\nDate: Sat, 17 Oct 2026 10:0${i}:00 +0200\r\nMessage-ID: <halo-move-${i}-${Date.now()}@example.invalid>\r\n\r\nText ${i}\r\n`);
          await wait(800);
          const viewBefore = Services.prefs.getIntPref("mail.threadpane.listview", 0);
          Services.prefs.setIntPref("mail.threadpane.listview", 0);
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(1200);
          const out = { visibility: d.visibilityState };
          const del = async () => {
            a3.threadTree.selectedIndex = 0; await wait(800);
            const n0 = f.getTotalMessages(false);
            a3.commandController.doCommand("cmd_delete");
            const card = a3.document.querySelector('#threadTree tr[is="thread-card"]:is(.selected, [aria-selected="true"]) .card-container');
            const r = { during: f.getTotalMessages(false) == n0, anims: card ? card.getAnimations().length : -1 };
            await wait(900);
            r.after = f.getTotalMessages(false) == n0 - 1;
            r.leftover = [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"] .card-container')].reduce((n, c) => n + c.getAnimations().length, 0);
            r.transition = getComputedStyle(a3.document.querySelector('#threadTree tr[is="thread-card"] .card-container')).transitionDuration.split(",")[0];
            return r; };
          try {
            out.normal = await del();
            await toCalendar(); w.switchToView("day"); await wait(500); w.switchToView("week"); await wait(50);
            out.view = getComputedStyle(d.getElementById("week-view")).animationName;
            // neue Mail gleitet oben ein, Ungelesen-Zahl des Ordners hüpft
            await toMail(); a3.displayFolder(f.URI); await wait(900);
            lf.addMessage(`From: Halo <h@example.invalid>
Subject: Bewegung neu
Date: Sun, 25 Oct 2026 23:59:00 +0100
Message-ID: <halo-move-new-${Date.now()}@example.invalid>

Neu
`);
            let arrived = 0, popped = 0;
            for (let t = 0; t < 1500 && !(arrived && popped); t += 30) { await wait(30);
              arrived ||= [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"] .card-container')].filter(c => c.getAnimations().length).length;
              popped ||= [...a3.document.querySelectorAll("#folderTree .unread-count")].filter(c => c.getAnimations().length).length; }
            out.arrival = { arrived, popped };
            Services.prefs.setIntPref("ui.prefersReducedMotion", 1); await wait(500);
            await toMail(); a3.displayFolder(f.URI); await wait(900);
            out.reduced = await del();
          } finally {
            Services.prefs.clearUserPref("ui.prefersReducedMotion");
            Services.prefs.setIntPref("mail.threadpane.listview", viewBefore);
          }
          return out;""")
        n, r = res.get("normal") or {}, res.get("reduced") or {}
        hidden = res.get("visibility") == "hidden"
        dur = lambda t: float(t.rstrip("ms")) / (1000 if t.endswith("ms") else 1) if t else 0
        ok = (n.get("during") and (n.get("anims") == 1 or hidden) and n.get("after") and n.get("leftover") == 0 and 0.05 <= dur(n.get("transition")) <= 0.25
              and res.get("view") == "mc-view-in" and (hidden or (res.get("arrival", {}).get("arrived") and res["arrival"].get("popped")))
              and r.get("anims") in (0, -1) and r.get("after") and r.get("transition") == "0.001s")
        return ok, f"{res}"
    check("Bewegung: Karte gleitet beim Löschen weg, neue Mail gleitet ein, Ungelesen-Zahl hüpft, Kalenderansicht blendet ein; „Bewegung reduzieren“ sofort", motion, results)

    def rtl_and_contrast():
        # Rechts-nach-links (Pseudosprache „bidi“, neues Fenster): Listenkopf über der Mailliste, Seitenleisten-Knopf
        # neben der Bereiche-Leiste rechts, Knöpfe über der Leseansicht links – gespiegelt wie die Fenster selbst;
        # Kontrastdesign (Windows): eigene Regeln vorhanden (auf dem Mac nicht einschaltbar)
        res = m.js(r"""
          Services.prefs.setStringPref("intl.l10n.pseudo", "bidi"); await wait(1500);
          const nw = w.open("chrome://messenger/content/messenger.xhtml", "_blank", "chrome,all,dialog=no");
          const out = {};
          try {
            await until(() => nw.document?.readyState == "complete" && nw.document.getElementById("tabmail")?.currentAbout3Pane?.document?.getElementById("threadPane"), 15000);
            nw.resizeTo(1500, 900); await wait(4000);
            const nd = nw.document, a3 = nd.getElementById("tabmail").currentAbout3Pane, off = a3.browsingContext.embedderElement.getBoundingClientRect();
            const R = e => { const r = e?.getBoundingClientRect(); return r && r.width ? { l: Math.round(r.left), r: Math.round(r.right) } : null; };
            const shift = (r) => r && { l: Math.round(r.l + off.left), r: Math.round(r.r + off.left) };
            out.dir = nw.getComputedStyle(nd.documentElement).direction;
            out.list = shift(R(a3.document.getElementById("threadPane"))); out.msg = shift(R(a3.document.getElementById("messagePane")));
            out.header = R(nd.getElementById("mcListHeader")); out.toggle = R(nd.getElementById("spacesPinnedButton"));
            out.spaces = R(nd.getElementById("spacesToolbar"));
            out.write = R(nd.querySelector('#unifiedToolbarContent > li[item-id="write-message"]'));
          } finally {
            Services.prefs.clearUserPref("intl.l10n.pseudo"); nw.close(); await wait(800);
          }
          out.forcedRules = /@media \(forced-colors: active\)/.test(await (await fetch("resource://mailcards/theme.css")).text());
          return out;""")
        L, H, T, S, Wr = res.get("list"), res.get("header"), res.get("toggle"), res.get("spaces"), res.get("write")
        ok = (res.get("dir") == "rtl" and L and H and T and S and Wr and res.get("forcedRules")
              and L["l"] - 2 <= H["l"] and H["r"] <= L["r"] + 2          # Kopf über der Liste
              and T["l"] > L["r"] and T["r"] <= S["l"]                    # Seitenleisten-Knopf rechts der Liste, links der Bereiche-Leiste
              and Wr["r"] <= L["l"] + 8)                                  # Verfassen über der Leseansicht (links der Liste)
        return ok, f"{res}"
    check("Rechts-nach-links: Listenkopf, Seitenleisten-Knopf und Knöpfe gespiegelt; Regeln fürs Kontrastdesign vorhanden", rtl_and_contrast, results)

    def sidebar_no_jump():
        # Mail: Ordnerliste ein-/ausblenden ohne Ruck in den letzten Bildern – vertikal und klassisch, enges Fenster
        # (Leseansicht an ihrer Mindestbreite) und breites: Ordnerliste, Mailliste und Leseansicht ändern sich je Bild
        # nur in eine Richtung, der Zustand nach dem Ende entspricht dem letzten Bild
        res = m.js(r'''
          const btn = d.getElementById("spacesPinnedButton");
          const out = { visibility: d.visibilityState };
          const viewBefore = [Services.prefs.getIntPref("mail.threadpane.listview", 0), Services.prefs.getIntPref("mail.pane_config.dynamic", 0)];
          try {
            for (const [name, view, layout, width] of [["karten-eng", 0, 2, 1280], ["karten-breit", 0, 2, 1500], ["klassisch-eng", 1, 0, 1280]]) {
              w.resizeTo(width, 900);
              Services.prefs.setIntPref("mail.threadpane.listview", view); Services.prefs.setIntPref("mail.pane_config.dynamic", layout);
              const a3 = await toMail(); await wait(1500);
              const fp = a3.document.getElementById("folderPane"), tp = a3.document.getElementById("threadPane"), mp = a3.document.getElementById("messagePane");
              const snap = () => [fp, tp, mp].map(e => Math.round(e.getBoundingClientRect().width * 10) / 10);
              for (const phase of ["aus", "ein"]) {
                btn.click();
                const frames = []; const t0 = performance.now();
                while (performance.now() - t0 < 600) { await new Promise(r => a3.requestAnimationFrame(r)); frames.push(snap()); }
                await wait(500); const end = snap();
                // Richtungswechsel je Spalte (mehr als 1,5 px gegen die Bewegung) und Abstand des Endes zum letzten Bild vor dem Ende
                const moving = frames.filter((f, i) => i && f.some((v, j) => Math.abs(v - frames[i - 1][j]) > 0.05));
                const back = [0, 1, 2].map(j => { let dir = 0, bad = 0; for (let i = 1; i < frames.length; i++) { const dv = frames[i][j] - frames[i - 1][j];
                  if (Math.abs(dv) < 0.05) continue; const sg = Math.sign(dv); if (dir && sg != dir && Math.abs(dv) > 1.5) bad++; dir = sg; } return bad; });
                // letzter Schritt: Thunderbirds Teiler (1 px) und Rundung dürfen 3 px ausmachen
                const lastStep = frames.length > 1 ? Math.max(...[0, 1, 2].map(j => {
                  const ch = frames.map((f, i) => i ? Math.abs(f[j] - frames[i - 1][j]) : 0).filter(x => x > 0.05);
                  return ch.length >= 2 ? ch[ch.length - 1] - Math.max(ch[ch.length - 2], 3) : 0; })) : 0;
                out[`${name}/${phase}`] = { frames: frames.filter((f, i) => !i || f.join() != frames[i - 1].join()).map(f => f.join("|")).join(" "), steps: moving.length, back, lastStep: Math.round(lastStep * 10) / 10, end, last: frames[frames.length - 1] };
              }
            }
          } finally {
            Services.prefs.setIntPref("mail.threadpane.listview", viewBefore[0]); Services.prefs.setIntPref("mail.pane_config.dynamic", viewBefore[1]);
            w.resizeTo(1500, 900); await wait(800);
          }
          return out;''')
        if res.get("visibility") == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        # (Windows-VM: emuliert, dort fallen Einzelbilder aus – der letzte Schritt darf etwas größer sein;
        # Linux in der CI: Zeitschwankungen, Bruchteile eines Pixels)
        last_max = 3 if sys.platform == "win32" else 1 if sys.platform != "darwin" else 0
        bad = [f"{k}: {v}" for k, v in res.items() if k != "visibility" and (v["steps"] < 6 or any(v["back"]) or v["lastStep"] > last_max
               or any(abs(a - b) > 2 for a, b in zip(v["end"], v["last"])))]
        return not bad, "; ".join(bad) or f"{res}"
    check("Seitenleiste (Mail): Ein-/Ausblenden ohne Ruck in den letzten Bildern (vertikal und klassisch, enges und breites Fenster)", sidebar_no_jump, results)

    def address_book():
        # Person und Firma (example.invalid) im persönlichen Adressbuch
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const add = props => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            for (const [k, v] of Object.entries(props)) c.setProperty(k, v);
            c.displayName = props.DisplayName; c.primaryEmail = props.PrimaryEmail; return book.addCard(c); };
          // einzeln anlegen – Anna gibt es evtl. schon (ADDRESS_EDIT_JS)
          const has = name => book.childCards.some(c => c.displayName == name);
          if (!has("Anna Beispiel")) add({ FirstName: "Anna", LastName: "Beispiel", DisplayName: "Anna Beispiel", PrimaryEmail: "anna@example.invalid", Company: "Beispiel GmbH", JobTitle: "Leitung", WorkPhone: "+43 1 234" });
          if (!has("Muster AG")) add({ DisplayName: "Muster AG", Company: "Muster AG", PrimaryEmail: "info@example.invalid", WorkPhone: "+43 1 999" });
          tm.openTab("addressBookTab", {}); await wait(2500);
          const ab = tm.currentTabInfo.browser.contentWindow; const ad = ab.document;
          const list = ad.getElementById("cards");
          const out = {};
          for (const name of ["Anna Beispiel", "Muster AG"]) {
            const i = [...Array(list.view.rowCount).keys()].find(k => list.view.getCardFromRow(k)?.displayName == name);
            list.selectedIndex = i; await wait(1200);
            const row = await until(() => [...ad.querySelectorAll("#cards tr")].find(r => r.querySelector(".name")?.textContent == name));
            const av = row?.querySelector("contact-avatar");
            const photo = ad.getElementById("viewContactPhoto");
            out[name] = { company: !!av?.classList.contains("mc-company"), letters: av?.shadowRoot?.querySelector("span")?.textContent,
              radius: av ? ab.getComputedStyle(av).borderRadius : null,
              photo: (photo.getAttribute("src") || "").slice(0, 60),
              books: [...ad.querySelectorAll("#mcDetailBooks .mc-book")].map(e => e.textContent),
              types: [...ad.querySelectorAll("#viewContact .entry-type")].filter(e => e.textContent).map(e => [e.textContent, ab.getComputedStyle(e).textTransform]) };
          }
          // Teiler anfassen ohne Bewegung: Kontaktliste bleibt gleich breit (kein Sprung)
          const shared = ad.getElementById("sharedSplitter"); const cards = ad.getElementById("cardsPane");
          const before = Math.round(cards.getBoundingClientRect().width);
          shared._updateSize?.(before); await wait(200);
          out.splitter = [before, Math.round(cards.getBoundingClientRect().width)];
          tm.closeTab(tm.currentTabInfo);
          return out;""")
        a, f = res.get("Anna Beispiel", {}), res.get("Muster AG", {})
        ok = (a.get("letters") == "AB" and not a.get("company") and a.get("photo", "").startswith("data:image/svg")
              and f.get("company") and "company-avatar.svg" in f.get("photo", "")
              and a.get("radius") == "50%" and a.get("books") and all(t[1] == "none" for t in a.get("types", []))
              and len(a.get("types", [])) >= 2 and abs(res["splitter"][0] - res["splitter"][1]) <= 1)
        return ok, f"{res}"
    check("Adressbuch: Firmen-Avatar, Initialen im Detail, Konto-Etiketten, Bezeichnungen, Teiler ohne Sprung", address_book, results)

    def ab_cards_like_mail():
        # Kartenansicht wie macOS-Kontakte: nur Name bzw. Firma, nie die E-Mail-Adresse; Breite der Liste und Bildgröße
        # wie die Mailkarten
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const add = props => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            for (const [k, v] of Object.entries(props)) c.setProperty(k, v);
            c.displayName = props.DisplayName || ""; c.primaryEmail = props.PrimaryEmail; return book.addCard(c); };
          const has = mail => book.childCards.some(c => c.primaryEmail == mail);
          if (!has("anna@example.invalid")) add({ FirstName: "Anna", LastName: "Beispiel", DisplayName: "Anna Beispiel", PrimaryEmail: "anna@example.invalid", Company: "Beispiel GmbH" });
          if (!has("nur.firma@example.invalid")) add({ Company: "Nurfirma KG", PrimaryEmail: "nur.firma@example.invalid" });
          if (!has("ohne.alles@example.invalid")) add({ PrimaryEmail: "ohne.alles@example.invalid" });
          if (!has("ben.ohne@example.invalid")) add({ FirstName: "Ben", LastName: "Ohnefirma", DisplayName: "Ben Ohnefirma", PrimaryEmail: "ben.ohne@example.invalid" });
          w.resizeTo(1500, 900); await wait(500);
          const a3 = await toMail(); await wait(800);
          const mailList = Math.round(a3.document.getElementById("threadPane").getBoundingClientRect().width);
          const mailAvatar = a3.document.querySelector('#threadTree tr[is="thread-card"] .mc-avatar');
          const mailAv = mailAvatar ? Math.round(mailAvatar.getBoundingClientRect().width) : null;
          tm.openTab("addressBookTab", {}); await wait(2500);
          const ab = tm.currentTabInfo.browser.contentWindow, ad = ab.document;
          await until(() => ad.querySelectorAll("#cards tr .name").length >= 4, 6000); await wait(600);
          const rowOf = mail => [...ad.querySelectorAll('#cards tr[is="ab-card-row"]')].find(r => { const i = r.index ?? r._index; return ab.cardsPane?.cardsList?.view?.getCardFromRow(i)?.primaryEmail == mail; });
          const show = r => r ? { name: r.querySelector(".name")?.textContent, second: r.querySelector(".address")?.textContent,
                                  secondShown: ab.getComputedStyle(r.querySelector(".ab-card-second-line")).display != "none" } : null;
          const out = { anna: show(rowOf("anna@example.invalid")), firma: show(rowOf("nur.firma@example.invalid")),
                        leer: show(rowOf("ohne.alles@example.invalid")), ben: show(rowOf("ben.ohne@example.invalid")),
                        list: Math.round(ad.getElementById("cardsPane").getBoundingClientRect().width), mailList,
                        avatar: Math.round(ad.querySelector("#cards contact-avatar").getBoundingClientRect().width), mailAv };
          out.anyMail = [...ad.querySelectorAll('#cards tr[is="ab-card-row"]')].filter(r => getComputedStyle(r).display != "none" && /@/.test(r.querySelector(".name")?.textContent + " " + (r.querySelector(".ab-card-second-line")?.checkVisibility() ? r.querySelector(".address")?.textContent : ""))).map(r => r.querySelector(".name")?.textContent);
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        a, f, e, b = res["anna"], res["firma"], res["leer"], res["ben"]
        ok = (a and a["name"] == "Anna Beispiel" and a["second"] == "Beispiel GmbH" and a["secondShown"]
              and f and f["name"] == "Nurfirma KG" and not f["secondShown"]
              and b and b["name"] == "Ben Ohnefirma" and not b["secondShown"]
              and e and e["name"] == "ohne.alles@example.invalid" and not e["secondShown"]
              and res["anyMail"] == ["ohne.alles@example.invalid"]
              and abs(res["list"] - res["mailList"]) <= 1 and res["avatar"] == (res["mailAv"] or 36))
        return ok, f"{res}"
    check("Adressbuch: Karten nur mit Name bzw. Firma (keine E-Mail-Adresse), Liste so breit und Bilder so groß wie bei den Mailkarten", ab_cards_like_mail, results)

    def photo_dialog():
        # Kontaktfoto wie Apple Kontakte: „Choose…“ öffnet jederzeit die Dateiauswahl, runder Ausschnitt ohne Eckgriffe,
        # Zoom-Regler unter dem Bild verkleinert den Ausschnitt um seine Mitte
        res = m.js(r"""
          tm.openTab("addressBookTab", {}); await wait(2500);
          const ab = tm.currentTabInfo.browser.contentWindow, ad = ab.document, pd = ab.photoDialog;
          const c = ad.createElement("canvas"); c.width = 400; c.height = 300;
          const g = c.getContext("2d"); g.fillStyle = "#4a90d9"; g.fillRect(0, 0, 400, 300);
          pd.showWithURL(c.toDataURL("image/png"), null);
          await until(() => !ad.querySelector("#photoDialog svg").hasAttribute("hidden"), 4000); await wait(300);
          const zoom = ad.getElementById("mcPhotoZoom"), choose = ad.getElementById("mcPhotoChoose");
          const out = { choose: !!choose && choose.checkVisibility(), chooseText: choose?.textContent,
                        zoom: !!zoom && zoom.checkVisibility(), value0: zoom?.value,
                        round: /a\d/.test(pd._cropMask.getAttribute("d")),
                        corners: [...pd._corners].filter(e => e.checkVisibility()).length,
                        below: zoom ? zoom.getBoundingClientRect().top >= ad.querySelector("#photoDialog svg").getBoundingClientRect().bottom - 1 : false };
          const before = { w: pd._cropRect.width, cx: pd._cropRect.x + pd._cropRect.width / 2, cy: pd._cropRect.y + pd._cropRect.height / 2 };
          zoom.value = "50"; zoom.dispatchEvent(new ab.Event("input"));
          const after = { w: pd._cropRect.width, cx: pd._cropRect.x + pd._cropRect.width / 2, cy: pd._cropRect.y + pd._cropRect.height / 2 };
          out.zoomed = after.w < before.w * 0.5 && Math.abs(after.cx - before.cx) < 1 && Math.abs(after.cy - before.cy) < 1;
          out.rect = Math.round(Number(pd._dragRect.getAttribute("width"))) == Math.round(after.w);
          let picked = false; const inp = pd._inputTarget, orig = inp.click; inp.click = () => { picked = true; };
          choose?.click(); inp.click = orig; out.picked = picked;
          ad.getElementById("photoDialog").close(); await wait(300);
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        ok = (res["choose"] and res["zoom"] and res["value0"] == "0" and res["round"] and res["corners"] == 0
              and res["below"] and res["zoomed"] and res["rect"] and res["picked"])
        return ok, f"{res}"
    check("Adressbuch: Kontaktfoto mit „Choose…“, rundem Ausschnitt ohne Eckgriffe und Zoom-Regler darunter", photo_dialog, results)

    def collected_hidden():
        # „Collected Addresses“ nicht in der Seitenleiste des Adressbuchs; ausgeschaltet wieder sichtbar
        res = m.js(r"""
          tm.openTab("addressBookTab", {}); await wait(2000);
          const ab = tm.currentTabInfo.browser.contentWindow, ad = ab.document;
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const uid = MailServices.ab.directories.find(x => x.dirPrefId == "ldap_2.servers.history")?.UID;
          const row = () => ad.querySelector(`#books > li[data-uid="${uid}"]`);
          const vis = () => !!row() && row().getBoundingClientRect().height > 0;
          const out = { uid: !!uid, hidden: !vis(), pab: [...ad.querySelectorAll("#books > li")].some(r => r.getBoundingClientRect().height > 0 && r.dataset.uid != uid) };
          Services.prefs.setBoolPref("extensions.mailcards.hideCollectedAddresses", false); await wait(400);
          out.shownWhenOff = vis();
          Services.prefs.clearUserPref("extensions.mailcards.hideCollectedAddresses"); await wait(400);
          out.hiddenAgain = !vis();
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        ok = res["uid"] and res["hidden"] and res["pab"] and res["shownWhenOff"] and res["hiddenAgain"]
        return ok, f"{res}"
    check("Adressbuch: „Collected Addresses“ nicht in der Seitenleiste (abschaltbar)", collected_hidden, results)

    def pab_properties_locked():
        # Eigenschaften des persönlichen Adressbuchs: Thunderbird sperrt den Namen
        # (readonly) – das Feld soll sichtbar gesperrt aussehen, nicht wie ein
        # normales Eingabefeld; das Feld eines neuen Adressbuchs bleibt normal
        res = m.js(r"""
          tm.openTab("addressBookTab", {});
          const ab = await until(() => tm.currentTabInfo.browser?.contentWindow?.SubDialog && tm.currentTabInfo.browser.contentWindow, 8000);
          await wait(800);
          const ad = ab.document, abTab = tm.currentTabInfo;
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const URL = "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
          const measure = async args => {
            ab.setTimeout(() => ab.SubDialog.open(URL, { features: "resizable=no" }, args), 0);
            const fr = await until(() => [...ad.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.location.href == URL
              && f.contentDocument.readyState == "complete" && f.contentDocument.getElementById("name")), 6000);
            await wait(600);
            const sd = fr?.contentDocument, sw = fr?.contentWindow, inp = sd?.getElementById("name");
            const cs = inp && sw.getComputedStyle(inp);
            const probe = sd?.createElement("span");
            let ctrl = null;
            if (probe) { probe.style.backgroundColor = "var(--mt-control)"; sd.body.append(probe); ctrl = sw.getComputedStyle(probe).backgroundColor; probe.remove(); }
            const out = inp && { ro: inp.readOnly, bg: cs.backgroundColor, ctrl, cursor: cs.cursor, color: cs.color };
            const dlg = sd?.querySelector("dialog");
            dlg?.getButton?.(dlg.buttons == "accept" ? "accept" : "cancel")?.click();
            await wait(600);
            return out;
          };
          const out = {};
          try {
            out.pab = await measure({ selectedDirectory: MailServices.ab.getDirectory("jsaddrbook://abook.sqlite") });
            out.neu = await measure({});
          } finally {
            tm.closeTab(abTab); await wait(400);
          }
          return out;""")
        p, n = res.get("pab") or {}, res.get("neu") or {}
        ok = (p.get("ro") is True and same_color(p.get("bg"), p.get("ctrl")) and p.get("cursor") == "default"
              and n.get("ro") is False and not same_color(n.get("bg"), n.get("ctrl")) and n.get("cursor") != "default")
        return ok, f"{res}"
    check("Adressbuch: Name des persönlichen Adressbuchs in „Eigenschaften“ sichtbar gesperrt, neues Adressbuch normal", pab_properties_locked, results)

    def pab_renamed():
        # „Personal Address Book“ heißt wie in Apple Kontakte „Contacts“ (in der
        # Sprache der Oberfläche) – auch in der Seitenleiste des Adressbuchs
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          tm.openTab("addressBookTab", {});
          const ab = await until(() => tm.currentTabInfo.browser?.contentWindow?.booksList && tm.currentTabInfo.browser.contentWindow, 8000);
          await wait(800);
          const row = ab.document.querySelector(`#books > li[data-uid="${book.UID}"] .bookRow-name`);
          const out = { name: book.dirName, row: row?.textContent, once: Services.prefs.getBoolPref("extensions.mailcards.pabRenamed", false),
            lang: Services.locale.appLocaleAsBCP47 };
          tm.closeTab(tm.currentTabInfo); await wait(300);
          return out;""")
        names = {"en": "Contacts", "de": "Kontakte", "fr": "Contacts", "es": "Contactos", "it": "Contatti"}
        want = names.get(res["lang"].split("-")[0], "Contacts")
        ok = res["name"] == want and res["row"] == want and res["once"]
        return ok, f"{res}"
    check("Adressbuch: persönliches Adressbuch heißt „Contacts“ wie in Apple Kontakte", pab_renamed, results)

    def pab_hidden():
        # Persönliches Adressbuch: leer ausgeblendet, über das „…“-Menü ein-/ausblendbar;
        # ein neuer Kontakt darin (z. B. über den Stern im Mailkopf) blendet es ein;
        # als einziges Adressbuch nie ausgeblendet (Menüeintrag dann gesperrt)
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const P = "extensions.mailcards.showPersonalAddressBook";
          const had = Services.prefs.prefHasUserValue(P) ? Services.prefs.getBoolPref(P) : null;
          const pab = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const otherURI = MailServices.ab.getDirectoryFromId(MailServices.ab.newAddressBook("Halo Zweitbuch", "", Ci.nsIAbManager.JS_DIRECTORY_TYPE)).URI;
          tm.openTab("addressBookTab", {});
          const ab = await until(() => tm.currentTabInfo.browser?.contentWindow?.booksList && tm.currentTabInfo.browser.contentWindow, 8000);
          const abTab = tm.currentTabInfo, ad = ab.document;
          await until(() => ad.getElementById("mcShowPersonalBook"), 6000); await wait(500);
          const vis = () => { const r = ad.querySelector(`#books > li[data-uid="${pab.UID}"]`); return !!r && r.getBoundingClientRect().height > 0; };
          const item = ad.getElementById("mcShowPersonalBook"), sc = ad.getElementById("sortContext");
          const menuState = async () => {
            const shown = new Promise(r => sc.addEventListener("popupshown", r, { once: true }));
            sc.openPopup(ad.getElementById("cards"), "after_start"); await Promise.race([shown, wait(3000)]); await wait(200);
            const st = { checked: item.hasAttribute("checked"), disabled: item.hasAttribute("disabled"), label: item.getAttribute("label"),
              view: (() => { let e = item.previousElementSibling; while (e && e.localName != "menucaption") e = e.previousElementSibling; return e?.getAttribute("mc-section"); })() };
            const hid = new Promise(r => sc.addEventListener("popuphidden", r, { once: true }));
            sc.hidePopup(); await Promise.race([hid, wait(2000)]);
            return st;
          };
          const out = {};
          let card = null;
          try {
            // persönliches Adressbuch eingeblendet und gewählt …
            Services.prefs.setBoolPref(P, true); await wait(400);
            ab.booksList.selectedIndex = ab.booksList.getIndexForUID(pab.UID); await wait(400);
            out.selBefore = ab.booksList.selectedIndex;
            Services.prefs.setBoolPref(P, false); await wait(400);
            // … verschwindet: Auswahl springt auf „Alle Adressbücher“
            out.hidden = !vis(); out.sel = ab.booksList.selectedIndex;
            out.menuOff = await menuState();
            item.setAttribute("checked", "true"); item.doCommand(); await wait(400);
            out.shownByMenu = vis() && Services.prefs.getBoolPref(P);
            Services.prefs.setBoolPref(P, false); await wait(400);
            const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            c.displayName = "Halo Stern"; c.primaryEmail = "stern@example.invalid";
            card = pab.addCard(c); await wait(400);
            out.shownByNewCard = vis();
            MailServices.ab.deleteAddressBook(otherURI); await wait(600);
            Services.prefs.setBoolPref(P, false); await wait(400);
            out.onlyBookShown = vis();
            out.menuOnly = await menuState();
          } finally {
            if (card) pab.deleteCards([card]);
            if (MailServices.ab.directories.some(d => d.URI == otherURI)) MailServices.ab.deleteAddressBook(otherURI);
            if (had === null) Services.prefs.clearUserPref(P); else Services.prefs.setBoolPref(P, had);
            tm.closeTab(abTab); await wait(400);
          }
          return out;""")
        mo, mon = res.get("menuOff") or {}, res.get("menuOnly") or {}
        ok = (res.get("hidden") and (res.get("selBefore") or 0) > 0 and res.get("sel") == 0 and mo.get("checked") is False and mo.get("disabled") is False
              and mo.get("view") == "view" and len(mo.get("label") or "") > 8)
        ok = (ok and res.get("shownByMenu") and res.get("shownByNewCard") and res.get("onlyBookShown")
              and mon.get("checked") is True and mon.get("disabled") is True)
        return ok, f"{res}"
    check("Adressbuch: persönliches Adressbuch ausblendbar über „…“, neuer Kontakt blendet es ein, als einziges Buch immer sichtbar", pab_hidden, results)

    def ab_last_contact():
        # Adressbuch öffnet mit dem zuletzt gewählten Kontakt; nie eine Liste ohne
        # Auswahl: nach Löschen des gewählten Kontakts und beim Buchwechsel ist
        # wieder ein Kontakt gewählt und im Detailbereich zu sehen
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const pab = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          // neue Kontakte im persönlichen Adressbuch blenden es dauerhaft ein –
          // Zustand merken und am Ende wiederherstellen
          const P = "extensions.mailcards.showPersonalAddressBook";
          const had = Services.prefs.prefHasUserValue(P) ? Services.prefs.getBoolPref(P) : null;
          const mk = (n, e) => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard); c.displayName = n; c.primaryEmail = e; return pab.addCard(c); };
          const made = [mk("Halo Erstkontakt", "erst@example.invalid"), mk("Halo Zweitkontakt", "zweit@example.invalid")];
          const second = made[1];
          const open = async () => {
            tm.openTab("addressBookTab", {});
            const ab = await until(() => tm.currentTabInfo.browser?.contentWindow?.cardsPane && tm.currentTabInfo.browser.contentWindow, 8000);
            await wait(1500);
            return ab;
          };
          const state = ab => { const l = ab.cardsPane.cardsList, idx = l.selectedIndices;
            return { n: idx.length, uid: idx.length == 1 ? l.view.getCardFromRow(idx[0])?.UID : null,
              shown: !ab.detailsPane.node.hidden && !!ab.detailsPane.currentCard }; };
          const out = {};
          let ab = null;
          try {
            ab = await open();
            ab.booksList.selectedIndex = 0; await wait(800);
            out.first = state(ab);
            const l = ab.cardsPane.cardsList;
            l.selectedIndex = l.view.getIndexForUID(second.UID); await wait(600);
            tm.closeTab(tm.currentTabInfo); await wait(500);
            ab = await open();
            out.reopened = state(ab);
            out.wantUID = second.UID;
            pab.deleteCards([second]); made.pop(); await wait(1000);
            out.afterDelete = state(ab);
            const brow = [...ab.booksList.querySelectorAll(":scope > li")].find(r => r.dataset.uid == pab.UID);
            ab.booksList.selectedIndex = ab.booksList.rows.indexOf(brow); await wait(1000);
            out.afterBook = state(ab);
            ab.booksList.selectedIndex = 0; await wait(600);
          } finally {
            if (made.length) pab.deleteCards(made);
            Services.prefs.clearUserPref("extensions.mailcards.lastContact");
            if (had === null) Services.prefs.clearUserPref(P); else Services.prefs.setBoolPref(P, had);
            if (ab) { tm.closeTab(tm.currentTabInfo); await wait(400); }
          }
          return out;""")
        f, r, d, b = (res.get(k) or {} for k in ("first", "reopened", "afterDelete", "afterBook"))
        ok = (f.get("n") == 1 and f.get("shown") and r.get("uid") == res.get("wantUID") and r.get("shown")
              and d.get("n") == 1 and d.get("uid") != res.get("wantUID") and d.get("shown")
              and b.get("n") == 1 and b.get("shown"))
        return ok, f"{res}"
    check("Adressbuch: öffnet mit dem zuletzt gewählten Kontakt, nie ohne gewählten Kontakt", ab_last_contact, results)

    def contact_edit():
        # Kontakt bearbeiten wie Apple Kontakte: eine Schrift, Überschriften über den Feldern,
        # volle Breite; zuerst nur Vor-/Nachname, E-Mail, Telefon, Adressen und Ausgefülltes
        res = m.js(ADDRESS_EDIT_JS + r"""
          // unter Last kommen die „Mehr“-Knöpfe erst nach den festen Wartezeiten dazu
          await until(() => ad.querySelector("#addr-book-edit-n .mc-more-button") && ad.querySelector("vcard-edit + .mc-more-button"), 6000);
          const font = ab.getComputedStyle(ad.documentElement).getPropertyValue("--mt-font").trim().split(",")[0];
          const ve = ad.querySelector("#editContactForm vcard-edit");
          const scroll = ve.parentElement;
          const ctrls = [...ad.querySelectorAll("#editContactForm :is(input:not([type=checkbox]), select, legend:not(.screen-reader-only), label:not(.screen-reader-only), .add-property-button:not(.only-icon))")]
            .filter(e => e.getClientRects().length);
          const fonts = [...new Set(ctrls.map(e => ab.getComputedStyle(e).fontFamily.split(",")[0]))];
          const sizes = [...new Set(ctrls.filter(e => !e.matches("label, legend")).map(e => ab.getComputedStyle(e).fontSize))];
          const tel = ad.getElementById("addr-book-edit-tel");
          const lg = tel.querySelector(":scope > legend").getBoundingClientRect(), inp = tel.querySelector("input[type=tel]").getBoundingClientRect();
          const out = { font, fonts, sizes, width: Math.round(ve.getBoundingClientRect().width),
            avail: Math.round(scroll.clientWidth - parseFloat(ab.getComputedStyle(scroll).paddingLeft) - parseFloat(ab.getComputedStyle(scroll).paddingRight)),
            legendAbove: lg.bottom <= inp.top && Math.abs(lg.left - tel.querySelector("select").getBoundingClientRect().left) <= 2 };
          const shown = () => [...ad.querySelectorAll("#addr-book-edit-n :is(input, .mc-more-button)")].filter(e => e.getClientRects().length).map(e => e.id || "mehr");
          const groups = () => [...ve.querySelectorAll(":scope > fieldset")].filter(e => e.getClientRects().length)
            .sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top).map(e => e.id.replace("addr-book-edit-", ""));
          const fn = ad.getElementById("vcard-n-firstname").getBoundingClientRect(), ln = ad.getElementById("vcard-n-lastname").getBoundingClientRect();
          out.names = { closed: shown(), sideBySide: Math.abs(fn.top - ln.top) <= 1 && Math.abs(fn.width - ln.width) <= 1 };
          out.groups = { closed: groups() };
          ad.querySelector("#addr-book-edit-n .mc-more-button").click();
          ad.querySelector("vcard-edit + .mc-more-button").click(); await wait(300);
          out.names.open = shown(); out.groups.open = groups();
          out.buttons = [...ad.querySelectorAll(".mc-more-button")].map(b => [b.textContent, b.getAttribute("aria-expanded")]);
          // Bild wie Apple Kontakte: Initialen, mittig über dem Namen; folgt dem Namen beim Tippen
          const photo = ad.querySelector("#photoInput .contact-photo"), pr = photo.getBoundingClientRect();
          const hr = ad.getElementById("editContactHeadingName").getBoundingClientRect();
          const letters = () => decodeURIComponent(photo.getAttribute("src") || "").match(/<text[^>]*>([^<]*)</)?.[1];
          out.photo = { letters: letters(), size: Math.round(pr.width), above: pr.bottom <= hr.top,
            centered: Math.abs((pr.left + pr.right) / 2 - (hr.left + hr.right) / 2) <= 2 };
          const first = ad.getElementById("vcard-n-firstname");
          first.value = "Berta"; first.dispatchEvent(new ab.InputEvent("input", { bubbles: true }));
          out.photo.typed = await until(() => letters() == "BB" && "BB") || letters();
          ab.detailsPane.isDirty = false; // Testeingabe verwerfen, ohne Rückfrage
          ad.getElementById("cancelEditButton").click(); await wait(500);
          const vp = ad.getElementById("viewContactPhoto");
          out.viewLetters = decodeURIComponent(vp.getAttribute("src") || "").match(/<text[^>]*>([^<]*)</)?.[1];
          out.viewSize = Math.round(vp.getBoundingClientRect().width);
          tm.closeTab(tm.currentTabInfo);
          return out;""")
        ok = (res["fonts"] == [res["font"]] and res["sizes"] == ["13px"]
              and res["width"] >= min(res["avail"], 1040) - 2 and res["legendAbove"]
              and res["names"]["closed"] == ["vcard-n-firstname", "vcard-n-lastname", "mehr"] and res["names"]["sideBySide"]
              and {"vcard-n-prefix", "vcard-n-middlename", "vcard-n-suffix", "vCardNickName", "vCardDisplayName"} <= set(res["names"]["open"])
              and res["groups"]["closed"][:4] == ["n", "email", "tel", "address"] and "org" in res["groups"]["closed"]
              and "url" not in res["groups"]["closed"] and "url" in res["groups"]["open"]
              and all(b[1] == "true" for b in res["buttons"]) and len(res["buttons"]) == 2
              and res["photo"]["letters"] == "AB" and res["photo"]["above"] and res["photo"]["centered"]
              and res["photo"]["typed"] == "BB" and res["viewLetters"] == "AB" and res["viewSize"] > res["photo"]["size"] >= 100)
        return ok, f"{res}"
    check("Adressbuch: Kontakt bearbeiten in Systemschrift, Überschriften über den Feldern, Wichtiges zuerst, Weiteres auf Wunsch, Initialen mittig über dem Namen", contact_edit, results)

    ab_views_res = {}

    def ab_views():
        # Kontakt-, Listen-, Auswahl-, Tabellen- und Leeransicht einmal messen
        if not ab_views_res:
            ab_views_res.update(m.js(r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const { VCardUtils } = ChromeUtils.importESModule("resource:///modules/VCardUtils.sys.mjs");
  const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const mk = props => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    for (const [k, v] of Object.entries(props)) if (!["DisplayName", "PrimaryEmail"].includes(k)) c.setProperty(k, v);
    c.displayName = props.DisplayName; c.primaryEmail = props.PrimaryEmail; return c; };
  const has = name => book.childCards.some(c => c.displayName == name);
  // was hier angelegt wird, am Ende wieder entfernen (spätere Prüfungen zählen Kontakte)
  const made = [];
  if (!has("Anna Beispiel")) book.addCard(mk({ FirstName: "Anna", LastName: "Beispiel", DisplayName: "Anna Beispiel", PrimaryEmail: "anna@example.invalid", Company: "Beispiel GmbH", JobTitle: "Leitung", WorkPhone: "+43 1 234" }));
  if (!has("Ben Muster")) made.push(book.addCard(mk({ FirstName: "Ben", LastName: "Muster", DisplayName: "Ben Muster", PrimaryEmail: "ben@example.invalid" })));
  if (!has("Jonas Ärmel")) made.push(book.addCard(VCardUtils.vCardToAbCard("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Jonas Ärmel\r\nN:Ärmel;Jonas;;;\r\nEMAIL;PREF=1:jonas@example.invalid\r\nTEL;TYPE=work:+43 1 777\r\nNOTE:Erfundener Testkontakt\r\nEND:VCARD\r\n")));
  if (!book.childNodes.some(l => l.dirName == "Halo Liste")) {
    const l = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
    l.isMailList = true; l.dirName = "Halo Liste"; l.listNickName = "haloliste";
    const ml = book.addMailList(l);
    for (const c of book.childCards) if (["Anna Beispiel", "Ben Muster", "Jonas Ärmel"].includes(c.displayName)) ml.addCard(c);
  }
  if (!MailServices.ab.directories.some(b => b.dirName == "Halo Leer")) MailServices.ab.newAddressBook("Halo Leer", "", Ci.nsIAbManager.JS_DIRECTORY_TYPE);
  tm.openTab("addressBookTab", {});
  const ab = await until(() => tm.currentTabInfo.browser?.contentWindow?.cardsPane && tm.currentTabInfo.browser.contentWindow, 8000);
  await wait(1500);
  const abTab = tm.currentTabInfo;
  const ad = ab.document, cs = e => ab.getComputedStyle(e);
  const R = e => e.getBoundingClientRect(), mid = e => { const r = R(e); return (r.left + r.right) / 2; };
  const list = ad.getElementById("cards");
  const rows = () => [...Array(list.view.rowCount).keys()];
  const pick = async name => { list.selectedIndex = rows().find(k => list.view.getCardFromRow(k)?.displayName == name); await wait(900); };
  // Hilfselement für die berechnete Akzentfarbe
  const probe = ad.createElement("span"); probe.style.color = "AccentColor"; ad.body.append(probe);
  const accent = cs(probe).color; probe.remove();
  const out = { accent };
  try {
    // Kontakt: Kopf mittig, Links in Akzentfarbe, eine Kante in den Karten
    await pick("Jonas Ärmel");
    const body = ad.getElementById("detailsBody"), photo = ad.getElementById("viewContactPhoto");
    const em = ad.querySelector("#emailAddresses");
    const firstVal = em.querySelector(".entry-value"), link = em.querySelector("a");
    const telType = ad.querySelector("#phoneNumbers .entry-type"), note = ad.querySelector("#notes > div");
    out.contact = { photoMid: Math.round(mid(photo) - mid(body)), photoW: Math.round(R(photo).width),
      link: link && [cs(link).textDecorationLine, cs(link).color],
      edges: [em.querySelector("h2"), firstVal, telType, note].map(e => e ? Math.round(R(e).left) : null),
      // Notiz so groß wie die übrigen Werte
      noteFont: note && [cs(note).fontSize, cs(firstVal).fontSize] };
    // Darstellungsmenü „…“: drei Abschnitte mit genau einer Trennlinie dazwischen
    const sc = ad.getElementById("sortContext");
    const shownP = new Promise(r => sc.addEventListener("popupshown", r, { once: true }));
    sc.openPopup(list, "after_start"); await Promise.race([shownP, wait(3000)]); await wait(300);
    out.sortMenu = [...sc.children].filter(e => !e.hidden && cs(e).display != "none")
      .map(e => e.localName == "menuseparator" ? "|" : e.localName == "menucaption" ? "#" + e.getAttribute("label") : (e.getAttribute("value") || e.id || "item"));
    const hiddenP = new Promise(r => sc.addEventListener("popuphidden", r, { once: true }));
    sc.hidePopup(); await Promise.race([hiddenP, wait(2000)]);
    // neuer Kontakt ohne Namen: Personen-Silhouette statt Initialen aus „New Contact“,
    // nach Eingabe von Vor- und Nachname deren Initialen
    {
      ab.detailsPane.editNewContact(); await wait(800);
      const ph = ad.querySelector("#photoInput .contact-photo");
      const srcOf = () => decodeURIComponent(ph?.getAttribute("src") || "");
      const before = srcOf();
      const typeIn = (id, v) => { const f = ad.getElementById(id); f.value = v; f.dispatchEvent(new ab.InputEvent("input", { bubbles: true })); };
      typeIn("vcard-n-firstname", "Test"); typeIn("vcard-n-lastname", "Person"); await wait(500);
      const after = srcOf();
      out.newContact = { before: before.slice(-40), person: before.endsWith("person-avatar.svg"),
        initials: after.startsWith("data:") && after.includes(">TP<"), heading: ad.getElementById("editContactHeadingName")?.textContent };
      ab.detailsPane.isDirty = false;
      ad.getElementById("cancelEditButton").click(); await wait(600);
    }
    // Kontakt bearbeiten: Papierkorb im Knopf „Delete“ mit Abstand zum Text,
    // links und rechts etwa gleich viel Rand in der Kapsel
    {
      await pick("Jonas Ärmel");
      ad.getElementById("editButton").click(); await wait(1200);
      const del = ad.getElementById("detailsDeleteButton");
      const tn = []; { const tw = ad.createTreeWalker(del, ab.NodeFilter.SHOW_TEXT); while (tw.nextNode()) if (tw.currentNode.textContent.trim()) tn.push(tw.currentNode); }
      const rg = ad.createRange(); if (tn.length) { rg.setStart(tn[0], 0); rg.setEnd(tn[tn.length - 1], tn[tn.length - 1].length); }
      const tr = tn.length ? rg.getBoundingClientRect() : null, br = R(del);
      const bx = parseFloat(cs(del).backgroundPositionX), ps = parseFloat(cs(del).paddingInlineStart);
      out.del = { visible: del.getClientRects().length > 0, bx, ps, gap: ps - (bx + 16),
        left: bx, right: tr ? Math.round(br.right - tr.right) : null, textGap: tr ? Math.round(tr.left - br.left - bx - 16) : null };
      ab.detailsPane.isDirty = false;
      ad.getElementById("cancelEditButton").click(); await wait(600);
    }
    // breiter Detailbereich (> 64em): Kopf bleibt auf der Achse
    const dp = ad.getElementById("detailsPane");
    out.wide = { pane: Math.round(R(dp).width) };
    // Tabellenansicht: kleines Foto, erste Karte ohne Scrollen sichtbar, Kopf auf der Achse
    ab.cardsPane.toggleLayout(true); await wait(1500); await pick("Jonas Ärmel"); await wait(600);
    // Darstellungsmenü in der Tabelle: ohne Sortierung kein leerer Titel „Sort“
    {
      w.focus(); abTab.browser.focus(); await wait(200);
      const shown = new Promise(r => sc.addEventListener("popupshown", r, { once: true }));
      sc.openPopup(list, "after_start"); await Promise.race([shown, wait(3000)]); await wait(300);
      out.sortMenuState = sc.state;
      out.sortMenuTable = [...sc.children].filter(e => !e.hidden && e.getClientRects().length > 0)
        .map(e => e.localName == "menuseparator" ? "|" : e.localName == "menucaption" ? "#" + e.getAttribute("mc-section") : (e.getAttribute("value") || e.id || "item"));
      const hid = new Promise(r => sc.addEventListener("popuphidden", r, { once: true }));
      sc.hidePopup(); await Promise.race([hid, wait(2000)]);
    }
    const lh2 = d.querySelector("#mcListHeader .mc-lh-more"), search = d.querySelector("#unifiedToolbarContent global-search-bar, #unifiedToolbarContent search-bar, #unifiedToolbarContent .search-bar");
    out.table = { photoW: Math.round(R(photo).width), photoMid: Math.round(mid(photo) - mid(body)),
      emTop: Math.round(R(em).top), paneBottom: Math.round(R(dp).bottom), dpW: Math.round(R(dp).width),
      more: lh2 && [Math.round(lh2.getBoundingClientRect().left), Math.round(lh2.getBoundingClientRect().right)],
      search: search && [search.localName, Math.round(search.getBoundingClientRect().left), Math.round(search.getBoundingClientRect().width)],
      line: w.getComputedStyle(d.getElementById("unifiedToolbarContainer"), "::before").content,
      firstBtn: [...d.querySelectorAll("#unifiedToolbarContent > li:not([item-id=spacer])")].filter(e => e.getClientRects().length && e.getBoundingClientRect().width).map(e => [e.getAttribute("item-id"), Math.round(e.getBoundingClientRect().left)]).slice(0, 6) };
    ab.cardsPane.toggleLayout(false); await wait(1500);
    out.cardsView = { photoW: Math.round(R(photo).width),
      more: lh2 && [Math.round(lh2.getBoundingClientRect().left), Math.round(lh2.getBoundingClientRect().right)],
      search: search && [Math.round(search.getBoundingClientRect().left), Math.round(search.getBoundingClientRect().width)],
      line: w.getComputedStyle(d.getElementById("unifiedToolbarContainer"), "::before").content };
    // Liste: Kontaktkopf weg, Listenkopf mittig mit Verlaufs-Kreis
    const lrow = [...ad.querySelectorAll("#books li.listRow")].find(li => li.textContent.includes("Halo Liste"));
    ab.booksList.selectedIndex = ab.booksList.rows.indexOf(lrow); await wait(1200);
    const lc = lrow.querySelector(".listRow-container") || lrow.firstElementChild;
    // Auswahl unfokussiert grau, fokussiert wie die Ordnerliste akzentgetönt
    list.focus(); await wait(300);
    const bgBlur = cs(lc).backgroundColor;
    const tint = ad.createElement("span"); ad.body.append(tint);
    tint.style.backgroundColor = "var(--mt-selected-unfocused)"; const unfocused = cs(tint).backgroundColor;
    tint.style.backgroundColor = "color-mix(in srgb, var(--mt-accent) 22%, transparent)"; const focused = cs(tint).backgroundColor;
    tint.remove();
    // Hauptfenster und Tab nach vorn, sonst gilt :focus-within nicht
    w.focus(); abTab.browser.focus(); ad.getElementById("books").focus(); await wait(300);
    const licon = lrow.querySelector(".listRow-icon");
    out.listSel = { bgBlur, bgFocus: cs(lc).backgroundColor, unfocused, focused, fw: ad.getElementById("books").matches(":focus-within"),
      icon: [cs(licon).backgroundColor, cs(licon).maskImage.startsWith('url("data:'), Math.round(R(licon).width)] };
    const brow = ad.querySelector("#books .bookRow > .bookRow-container");
    out.listRow = { border: cs(lc).borderTopWidth, radius: cs(lc).borderTopLeftRadius, font: cs(lc).fontSize,
      h: Math.round(R(lc).height), bookH: Math.round(R(brow).height), bg: cs(lc).backgroundColor,
      // eingerückt unter seinem Buch
      indent: Math.round(R(lrow.querySelector(".listRow-icon")).left - R(lrow.parentElement.closest("li").querySelector(".bookRow-icon")).left) };
    // Abstand Symbol → Name gleich bei Verteilerliste und Buch
    {
      const brow2 = lrow.parentElement.closest("li");
      out.nameGap = { list: Math.round(R(lrow.querySelector(".listRow-name")).left - R(lrow.querySelector(".listRow-icon")).right),
        book: Math.round(R(brow2.querySelector(".bookRow-name")).left - R(brow2.querySelector(".bookRow-icon")).right) };
    }
    // Auswahlfarbe einer gewählten Buchzeile zum Vergleich
    ab.booksList.selectedIndex = 0; await wait(1200);
    await pick("Halo Liste");
    // Zeile der Verteilerliste: Symbol weiß und klein auf dem Verlauf
    const lav = list.getRowAtIndex?.(list.selectedIndex)?.querySelector("contact-avatar.is-mail-list");
    const limg = lav?.shadowRoot?.querySelector("img");
    out.listAvatar = lav && { bg: cs(lav).backgroundImage.includes("linear-gradient"), color: cs(lav).color,
      w: Math.round(R(lav).width), img: limg ? Math.round(R(limg).width) : null };
    const ch = ad.querySelector("#viewContact .contact-header"), lh = ad.querySelector("#viewContact .list-header");
    const lname = ad.getElementById("viewListName"), av = lh.querySelector(".recipient-avatar");
    out.list = { headerDisplay: cs(ch).display, photoRects: photo.getClientRects().length, hidden: ch.hidden,
      listMid: Math.round(mid(lname) - mid(body)), font: [cs(lname).fontSize, cs(lname).fontWeight],
      avatar: [Math.round(R(av).width), cs(av).backgroundImage.slice(0, 15), Math.round(mid(av) - mid(body))] };
    // Mehrfachauswahl
    ad.getElementById("cards").focus();
    list.selectedIndices = rows().filter(k => ["Anna Beispiel", "Ben Muster", "Jonas Ärmel"].includes(list.view.getCardFromRow(k)?.displayName)); await wait(1200);
    const cnt = ad.getElementById("viewSelectionCount"), sel = ad.getElementById("selectedCards");
    const avs = [...sel.querySelectorAll("contact-avatar")];
    out.multi = { headerDisplay: cs(ch).display, photoRects: photo.getClientRects().length,
      countMid: Math.round(mid(cnt) - mid(sel)), font: cs(cnt).fontSize, n: avs.length,
      avatars: avs.map(a => [cs(a).backgroundImage.includes("linear-gradient"), cs(a).color, cs(a).fontSize]) };
    // leeres Buch
    const erow = [...ad.querySelectorAll("#books li")].find(li => li.textContent.includes("Halo Leer"));
    ab.booksList.selectedIndex = ab.booksList.rows.indexOf(erow); await wait(1500);
    const slot = list.shadowRoot?.querySelector('slot[name="placeholders"]') || ad.querySelector('#cards > slot[name="placeholders"]');
    const btn = ad.getElementById("placeholderCreateContact"), empty = ad.getElementById("placeholderEmptyBook");
    out.empty = { opacity: slot && cs(slot).opacity, btn: [btn.getClientRects().length, cs(btn).fontSize, cs(btn).color],
      emptyColor: cs(empty).color, tert: cs(ad.documentElement).getPropertyValue("--mt-text-tertiary").trim() };
    // leeres Buch: Details ausgeblendet, rechts derselbe Grund wie die Kontaktliste
    {
      const dpR = R(ad.getElementById("cardsPane"));
      let el = ad.elementFromPoint(Math.round((dpR.right + ab.innerWidth) / 2), Math.round(ab.innerHeight / 2)), bg = null;
      for (; el; el = el.parentElement) { const c = cs(el).backgroundColor; if (c != "transparent" && !/rgba\(.*, 0\)$/.test(c)) { bg = [el.id || el.localName, c]; break; } }
      if (!bg) bg = ["root", cs(ad.documentElement).backgroundColor];
      out.emptyBg = { detailsHidden: ad.getElementById("detailsPane").hidden || cs(ad.getElementById("detailsPane")).display == "none",
        root: cs(ad.documentElement).backgroundColor, cards: cs(ad.getElementById("cardsPane")).backgroundColor, right: bg };
    }
    ab.booksList.selectedIndex = 0; await wait(1200);
  } finally {
    tm.closeTab(abTab);
    const ml = book.childNodes.find(l => l.dirName == "Halo Liste"); if (ml) book.deleteDirectory(ml);
    if (made.length) book.deleteCards(made);
    const eb = MailServices.ab.directories.find(b => b.dirName == "Halo Leer"); if (eb) MailServices.ab.deleteAddressBook(eb.URI);
    await wait(500);
  }
  return out;"""))
        return ab_views_res

    def ab_heads():
        # Verteilerliste und Mehrfachauswahl: kein leerer Kontaktkreis, Kopf mittig
        # und groß (Liste im Verlauf der Initialen-Kreise); Mitglieder-Kreise wie
        # in der Liste; Kontaktkopf auch im breiten Detailbereich (Tabelle) mittig
        res = ab_views()
        li, mu, ta = res["list"], res["multi"], res["table"]
        ok = (li["headerDisplay"] == "none" and li["photoRects"] == 0 and abs(li["listMid"]) <= 2
              and li["font"] == ["28px", "700"] and li["avatar"][0] == 120 and li["avatar"][1] == "linear-gradient" and abs(li["avatar"][2]) <= 2
              and mu["headerDisplay"] == "none" and mu["photoRects"] == 0 and abs(mu["countMid"]) <= 2 and mu["font"] == "28px"
              and mu["n"] >= 3 and all(a == [True, "rgb(255, 255, 255)", "15px"] for a in mu["avatars"])
              and abs(res["contact"]["photoMid"]) <= 2 and abs(ta["photoMid"]) <= 2 and ta["dpW"] > 840)
        return ok, f"{res}"
    check("Adressbuch: Verteilerliste und Mehrfachauswahl ohne leeren Kreis, Kopf mittig; Mitglieder-Kreise im Verlauf; Kontaktkopf auch breit mittig", ab_heads, results)

    def ab_details_cards():
        # Detailkarten: Links in der Akzentfarbe ohne Unterstrich, Überschrift,
        # Bezeichnungen, Werte ohne Bezeichnung und Notiz an einer Kante;
        # Verteilerliste in der Bücherliste wie die Buchzeilen; leeres Buch mit
        # kräftigem „New Contact“ statt halb durchsichtigem Hinweis
        res = ab_views()
        c, lr, e = res["contact"], res["listRow"], res["empty"]
        edges = c["edges"]
        ok = (c["link"] == ["none", res["accent"]] and None not in edges and max(edges) - min(edges) <= 1
              and lr["border"] == "0px" and lr["radius"] == "8px" and lr["font"] == "13px" and abs(lr["h"] - lr["bookH"]) <= 1 and lr["indent"] >= 16
              and e["opacity"] == "1" and e["btn"] == [1, "13px", res["accent"]])
        return ok, f"{res}"
    check("Adressbuch: Links in Akzentfarbe, Karteninhalt an einer Kante, Verteilerliste in der Bücherliste wie Buchzeilen, leeres Buch mit kräftigem Knopf", ab_details_cards, results)

    def ab_footer_gaps():
        # Bearbeiten: Papierkorb im Knopf „Delete“ mit Abstand zum Text (statt
        # fast daran klebend), Rand links/rechts ähnlich; Bücherliste: Name der
        # Verteilerliste so weit hinter dem Symbol wie bei den Büchern (eingerückt);
        # leeres Buch: rechts kein dunklerer, blaustichiger Seitengrund
        res = ab_views()
        dl, ng, eb, lr = res.get("del") or {}, res.get("nameGap") or {}, res.get("emptyBg") or {}, res.get("listRow") or {}
        ok = (dl.get("visible") and dl["gap"] >= 4 and dl["bx"] >= 10 and dl["textGap"] is not None and dl["textGap"] >= 4
              and abs(dl["left"] - dl["right"]) <= 6
              and ng and abs(ng["list"] - ng["book"]) <= 1 and 4 <= ng["book"] <= 8 and lr.get("indent", 0) > 0
              and eb.get("detailsHidden") and same_color(eb["root"], eb["cards"]) and same_color(eb["right"][1], eb["cards"]))
        return ok, f"del={dl} nameGap={ng} emptyBg={eb}"
    check("Adressbuch: Papierkorb im Knopf „Delete“ mit Abstand zum Text; Verteilerliste in der Bücherliste mit gleichem Namensabstand wie Bücher; leeres Buch rechts im Grund der Kontaktliste", ab_footer_gaps, results)

    def ab_table():
        # Tabellenansicht: kleines Foto, erste Karte ohne Scrollen sichtbar;
        # „…“ des Listenkopfs nicht über dem Suchfeld, Knöpfe rechts davon,
        # Suche so breit wie in der Kartenansicht, ohne Trennlinie ohne Spalte
        res = ab_views()
        ta, cv = res["table"], res["cardsView"]
        btns = [b[1] for b in ta["firstBtn"]]
        ok = (ta["photoW"] <= 100 and ta["emTop"] < ta["paneBottom"] and cv["photoW"] == 260
              and ta["more"] and ta["search"] and ta["more"][1] <= ta["search"][1] and btns and min(btns) >= ta["more"][1]
              and ta["search"][2] >= cv["search"][1] - 2 and ta["line"] == "none" and cv["line"] != "none")
        return ok, f"{res}"
    check("Adressbuch-Tabelle: kleines Foto mit sichtbaren Karten; „…“ nicht über der Suche, Knöpfe an ihrem Platz", ab_table, results)

    def ab_list_menu():
        # Notiz in 14 px wie die übrigen Werte; Verteilerliste in der Kontaktliste
        # mit weißem, kleinem Symbol auf dem Verlauf statt frei stehendem Umriss;
        # Darstellungsmenü: „Show Names As“ | „Sort“ | „View“ – je genau eine
        # Trennlinie, innerhalb von „View“ keine
        res = ab_views()
        c, la, sm = res["contact"], res.get("listAvatar"), res.get("sortMenu") or []
        view = sm.index("#View") if "#View" in sm else -1
        ok = (c.get("noteFont") == ["14px", "14px"]
              and bool(la) and la["bg"] and la["color"] == "rgb(255, 255, 255)" and la["img"] is not None and la["img"] <= 24
              and sm.count("|") == 2 and view > 0 and sm[view - 1] == "|" and "|" not in sm[view:]
              and "mcHideDuplicates" in sm[view:] and "sortContextTableLayout" in sm[view:] and "addrbook" in sm[view:])
        return ok, f"note={c.get('noteFont')} listAvatar={la} sortMenu={sm}"
    check("Adressbuch: Notiz so groß wie die Werte; Verteilerliste in der Liste im Verlaufskreis; Darstellungsmenü mit je einer Trennlinie zwischen den Abschnitten", ab_list_menu, results)

    def ab_list_select_new():
        # Verteilerliste in der Bücherliste: Auswahl unfokussiert grau, fokussiert
        # akzentgetönt wie die Ordnerliste, Symbol in der Akzentfarbe; Tabellen-
        # ansicht ohne leeren Titel „Sort“ und ohne doppelte Linie; neuer
        # Kontakt ohne Namen mit Silhouette statt „NC“, danach mit Initialen
        res = ab_views()
        ls, st, nc = res.get("listSel") or {}, res.get("sortMenuTable") or [], res.get("newContact") or {}
        # keine Linie am Rand oder doppelt; jeder Titel nach dem ersten mit Linie davor und Eintrag danach
        seps_ok = (bool(st) and st[0] != "|" and st[-1] != "|" and "#sort" not in st
                   and all(not (x == "|" and y == "|") for x, y in zip(st, st[1:]))
                   and all(i + 1 < len(st) and st[i + 1] != "|" and not st[i + 1].startswith("#") and (i == 0 or st[i - 1] == "|")
                           for i, x in enumerate(st) if x.startswith("#")))
        ok = (bool(ls) and same_color(ls["bgBlur"], ls["unfocused"]) and same_color(ls["bgFocus"], ls["focused"])
              and not same_color(ls["bgFocus"], ls["bgBlur"])
              and same_color(ls["icon"][0], res["accent"]) and ls["icon"][1] and ls["icon"][2] == 18
              and seps_ok and "sortContextTableLayout" in st
              and nc.get("person") is True and nc.get("initials") is True)
        return ok, f"listSel={ls} sortMenuTable={st} state={res.get('sortMenuState')} newContact={nc}"
    check("Adressbuch: Verteilerliste in der Bücherliste fokussiert akzentgetönt mit Akzentsymbol; Tabellen-Darstellungsmenü ohne leeres „Sort“; neuer Kontakt mit Silhouette statt „NC“", ab_list_select_new, results)

    def ab_search_dialog():
        # Adressen suchen: Bedingungen und Ergebnisse als Flächen mit Haarlinie
        # und 8 px Radius (dunkel keine schwarze Liste), Teiler als eine Linie
        res = m.js(COMPOSE_CHECK_JS + r"""
          later(() => w.MsgSearchAddresses());
          const sw = await winUrl("abSearchDialog"); if (!sw) throw new Error("Adressen suchen nicht offen");
          await pause(1000);
          try {
            const sd = sw.document, t = sd.getElementById("abResultsTree"), l = sd.getElementById("searchTermList"), sp = sd.getElementById("gray_horizontal_splitter");
            return { tree: [csOf(t).backgroundColor, csOf(t).borderTopLeftRadius, csOf(t).borderTopColor],
                     terms: [csOf(l).backgroundColor, csOf(l).borderTopLeftRadius, csOf(l).borderTopColor],
                     split: [csOf(sp).borderTopWidth, csOf(sp).borderBottomWidth],
                     win: colorOf(sd, "var(--mt-window)", "backgroundColor"), line: colorOf(sd, "var(--mt-pane-line)", "borderTopColor") };
          } finally { await shut(sw); }""")
        ok = (all(same_color(x[0], res["win"]) and x[1] == "8px" and same_color(x[2], res["line"]) for x in (res["tree"], res["terms"]))
              and res["tree"][0] != "rgb(0, 0, 0)" and res["split"][1] == "0px" and res["split"][0] in ("1px", "0.5px"))
        return ok, f"{res}"
    check("Adressen suchen: Bedingungen und Ergebnisse als Flächen mit Haarlinie, keine schwarze Liste, Teiler als eine Linie", ab_search_dialog, results)

    def ab_edit_dialogs():
        # Bearbeiten gleich nach dem Öffnen: das Layout (Weitere Felder) greift
        # auch, wenn vcard-edit erst nach dem ersten Aufruf definiert wird;
        # Kontaktbild-Dialog zeigt Hinweis und Symbol (Dateifeld durchsichtig,
        # Fläche als Karte); Unterdialoge im Tab auf neutraler Fläche (dunkel
        # nicht Thunderbirds Blaugrau)
        res = m.js(r"""
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  if (!book.childCards.some(c => c.displayName == "Anna Beispiel")) {
    const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    c.setProperty("FirstName", "Anna"); c.setProperty("LastName", "Beispiel");
    c.displayName = "Anna Beispiel"; c.primaryEmail = "anna@example.invalid"; book.addCard(c);
  }
  const out = { race: [] };
  // Wettlauf: Tab neu öffnen und ohne Wartezeit bearbeiten – das Layout greift trotzdem
  for (let n = 0; n < 3; n++) {
    tm.openTab("addressBookTab", {});
    const tab = tm.currentTabInfo;
    const ab = await until(() => { const c = tab.browser?.contentWindow; return c?.document?.getElementById("cards")?.view?.rowCount && c; }, 8000);
    const ad = ab.document, list = ad.getElementById("cards");
    list.selectedIndex = [...Array(list.view.rowCount).keys()].find(k => list.view.getCardFromRow(k)?.displayName == "Anna Beispiel");
    await until(() => !ad.getElementById("editButton").hidden && ad.getElementById("editButton").getClientRects().length, 4000);
    ad.getElementById("editButton").click();
    await until(() => ad.querySelector("#addr-book-edit-n .mc-more-button"), 4000);
    const url = ad.getElementById("addr-book-edit-url");
    out.race.push({ more: !!ad.querySelector("#addr-book-edit-n .mc-more-button"), url: url ? url.getClientRects().length : null,
      layout: ab.customElements.get("vcard-edit")?.prototype.__mcLayout === true });
    if (n == 2) {
      // Kontaktbild-Dialog: Hinweis sichtbar, Feld durchsichtig, Fläche als Karte
      ad.getElementById("photoButton").click();
      const dlg = await until(() => ad.getElementById("photoDialog")?.open && ad.getElementById("photoDialog"), 4000);
      const fi = ad.getElementById("dialogFileInput"), dt = ad.getElementById("photoDropTarget");
      const lab = ad.querySelector('label[for="dialogFileInput"]');
      out.photo = { open: !!dlg, bg: ab.getComputedStyle(fi).backgroundColor, border: ab.getComputedStyle(fi).borderTopWidth,
        radius: ab.getComputedStyle(dt).borderTopLeftRadius, label: lab?.getClientRects().length,
        // Hinweis unter dem Symbol (nicht darüber), Knopfleiste ohne eigene Fläche
        below: Math.round(lab.getBoundingClientRect().top + parseFloat(ab.getComputedStyle(lab).paddingTop) - dt.getBoundingClientRect().top),
        menu: ab.getComputedStyle(ad.querySelector("#photoDialog .dialog-menu-container")).backgroundColor,
        dlgBg: ab.getComputedStyle(ad.getElementById("photoDialog")).backgroundColor,
        sheet: ab.getComputedStyle(ad.documentElement).getPropertyValue("--mt-sheet").trim() };
      ad.getElementById("photoDialog").close(); await wait(300);
    }
    ab.detailsPane.isDirty = false;
    ad.getElementById("cancelEditButton").click(); await wait(400);
    if (n == 2) {
      // Unterdialog „Neue Verteilerliste“: neutrale Fläche
      w.setTimeout(() => ab.createList(), 0);
      const fr = await until(() => [...ad.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.location.href != "about:blank"), 6000);
      await wait(800);
      const box = ad.querySelector(".dialogBox"), sd = fr.contentDocument, sw = fr.contentWindow;
      const dlg = sd.querySelector("dialog");
      out.sub = { box: ab.getComputedStyle(box).backgroundColor, root: sw.getComputedStyle(sd.documentElement).backgroundColor,
        dialog: dlg && sw.getComputedStyle(dlg).backgroundColor, subAttr: sd.documentElement.hasAttribute("subdialog"),
        sheet: sw.getComputedStyle(sd.documentElement).getPropertyValue("--mt-sheet").trim() };
      (sd.querySelector("dialog")?.getButton?.("cancel") || null)?.click();
      await wait(600);
    }
    tm.closeTab(tab); await wait(300);
  }
  return out;""")
        import re
        ph, sub = res.get("photo", {}), res.get("sub", {})
        def neutral(c):
            v = [int(x) for x in re.findall(r"\d+", c or "")[:3]]
            return len(v) == 3 and max(v) - min(v) <= 4
        ok = (len(res["race"]) == 3 and all(r == {"more": True, "url": 0, "layout": True} for r in res["race"])
              and ph.get("open") and ph.get("bg") in ("rgba(0, 0, 0, 0)", "transparent") and ph.get("border") == "0px"
              and ph.get("radius") == "12px" and ph.get("label", 0) > 0 and ph.get("below", 0) >= 90
              and ph.get("menu") in ("rgba(0, 0, 0, 0)", "transparent") and neutral(ph.get("dlgBg"))
              and sub.get("subAttr") and all(neutral(sub.get(k)) for k in ("box", "root", "dialog"))
              and sub.get("box") != "rgb(26, 32, 44)" and sub.get("box") == sub.get("dialog"))
        return ok, f"{res}"
    check("Adressbuch: Bearbeiten-Layout auch sofort nach dem Öffnen; Kontaktbild-Dialog mit Hinweis; Unterdialoge auf neutraler Fläche", ab_edit_dialogs, results)

    OPEN_BOOKS_JS = r"""
          tm.openTab("addressBookTab", {});
          const cw = await until(() => { const c = tm.currentTabInfo?.browser?.contentWindow; return c?.document?.getElementById("mcBooksHeader") && c; }, 8000);
          const abTab = tm.currentTabInfo;"""

    def ab_background_header():
        # Adressbuch im Hintergrund: Änderungen an Kontakten (gesammelte Adressen,
        # CardDAV) überschreiben nicht die Kopfzeile über der Mailliste
        res = m.js(MESSAGE_JS + OPEN_BOOKS_JS + r"""
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const title = () => d.querySelector("#mcListHeader .mc-lh-title")?.textContent;
          await wait(800);
          const abTitle = title();
          await toMail();
          const before = title(); const seen = new Set([before]);
          const iv = w.setInterval(() => seen.add(title()), 20);
          let c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
          c.displayName = "Hinter Grund"; c.primaryEmail = "hinter.grund@example.invalid";
          try {
            c = book.addCard(c); await wait(1500);
            c.setProperty("PopularityIndex", 3); book.modifyCard(c); await wait(1500);
          } finally {
            book.deleteCards([c]); await wait(1500);
            w.clearInterval(iv);
            tm.closeTab(abTab); await toMail();
          }
          return { tab: !!cw, abTitle, before, seen: [...seen] };""")
        ok = res["tab"] and res["before"] and res["abTitle"] != res["before"] and res["seen"] == [res["before"]]
        return ok, f"{res}"
    check("Adressbuch im Hintergrund: Kopfzeile der Mailliste bleibt, wenn sich Kontakte ändern", ab_background_header, results)

    def ab_avatar_recycle():
        # Kontaktzeilen werden beim Scrollen wiederverwendet: lädt das Foto des
        # neuen Kontakts nicht, erscheinen seine Initialen (nicht die des vorigen)
        res = m.js(OPEN_BOOKS_JS + r"""
          const ad = cw.document;
          const el = ad.createElement("contact-avatar"); ad.body.append(el);
          const img = el.shadowRoot.querySelector("img"), letters = el.shadowRoot.querySelector("span");
          const svg = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='red'/></svg>");
          el.setData({ card: { displayName: "Anna Alt", primaryEmail: "anna.alt@example.invalid", photoURL: svg, emailAddresses: [] } });
          const loaded = await until(() => img.complete && img.naturalWidth > 0, 3000);
          el.setData({ card: { displayName: "Ben Neu", primaryEmail: "ben.neu@example.invalid", photoURL: "data:image/png;base64,AAAA", emailAddresses: [] } });
          await until(() => img.hidden, 3000); await wait(200);
          const out = { loaded, hidden: img.hidden, letters: letters.textContent };
          el.remove(); tm.closeTab(abTab); await toMail();
          return out;""")
        return res["loaded"] and res["hidden"] and res["letters"] == "BN", f"{res}"
    check("Adressbuch: wiederverwendete Kontaktzeile zeigt bei defektem Foto die eigenen Initialen", ab_avatar_recycle, results)

    def ab_dedupe_selection():
        # Dubletten, die per Sync dazukommen, werden beim nächsten Sortieren
        # zusammengeführt: die Auswahl bleibt beim gewählten Kontakt statt auf den
        # Nachbarn zu rutschen; fällt die gewählte Dublette weg, ist der verbliebene Eintrag gewählt
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const add = props => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            for (const [k, v] of Object.entries(props)) c.setProperty(k, v);
            c.displayName = props.DisplayName; c.primaryEmail = props.PrimaryEmail; return book.addCard(c); };
          const cards = [add({ DisplayName: "Dora Doppel", PrimaryEmail: "dora@example.invalid" }),
                         add({ DisplayName: "Ella Eins", PrimaryEmail: "ella@example.invalid" }),
                         add({ DisplayName: "Zeno Ziel", PrimaryEmail: "zeno@example.invalid" })];
          """ + OPEN_BOOKS_JS + r"""
          const out = { tab: !!cw };
          try {
            const list = cw.document.getElementById("cards");
            const rows = () => [...Array(list.view.rowCount).keys()];
            const sel = () => rows().filter(i => list.view.selection.isSelected(i)).map(i => list.view.getCardFromRow(i)?.UID);
            const pick = test => { list.selectedIndex = rows().find(i => test(list.view.getCardFromRow(i))); };
            // eine Änderung an einem anderen Kontakt sortiert neu (und führt zusammen)
            const touch = async n => { cards[2].setProperty("PopularityIndex", n); book.modifyCard(cards[2]); await wait(800); };
            await until(() => list.view?.rowCount >= 3); await wait(500);
            pick(c => c?.UID == cards[1].UID); await wait(500);
            cards.push(add({ DisplayName: "Dora Doppel", PrimaryEmail: "dora@example.invalid" })); await wait(600);
            const n = list.view.rowCount;
            await touch(2);
            out.neighbor = { merged: list.view.rowCount == n - 1, sel: sel(), want: cards[1].UID };
            pick(c => c?.displayName == "Dora Doppel"); await wait(500);
            cards.push(add({ DisplayName: "Dora Doppel", PrimaryEmail: "dora@example.invalid", Company: "Doppel AG", JobTitle: "Leitung", WorkPhone: "+43 1 555" })); await wait(600);
            await touch(3);
            out.dropped = { merged: list.view.rowCount == n - 1, sel: sel(), want: cards[4].UID, shown: cw.detailsPane?.currentCard?.UID };
          } finally {
            book.deleteCards(cards); await wait(300);
            tm.closeTab(abTab); await toMail();
          }
          return out;""")
        nb, dr = res.get("neighbor", {}), res.get("dropped", {})
        ok = (res["tab"] and nb.get("merged") and nb.get("sel") == [nb.get("want")]
              and dr.get("merged") and dr.get("sel") == [dr.get("want")] and dr.get("shown") == dr.get("want"))
        return ok, f"{res}"
    check("Adressbuch: Zusammenführen von Dubletten lässt die Auswahl beim gewählten Kontakt, Details zeigen den verbliebenen Eintrag", ab_dedupe_selection, results)

    def donate():
        # „Say Thanks“ im Info-Fenster öffnet die Spendenseite (Aufruf abgefangen, kein echter Browser)
        res = m.js('''
          await toMail();
          const orig = w.openLinkExternally; let opened = null;
          w.openLinkExternally = url => { opened = String(url); };
          d.getElementById("mcHaloSpaces").doCommand();
          const hw = await until(() => [...Services.wm.getEnumerator(null)].find(x => x.location?.href.startsWith("resource://mailcards/about/halo.html") && x.document.getElementById("version")?.textContent));
          await wait(500);
          hw?.document.getElementById("donate")?.click(); await wait(300);
          // keine Mailadresse unten – dafür gibt es „Send Feedback“
          const address = /@/.test(hw?.document.body.textContent || "");
          const last = hw?.document.querySelector("main")?.lastElementChild?.getBoundingClientRect();
          const room = last ? Math.round(hw.innerHeight - last.bottom) : null;
          // Kopf: Logo oben mittig, darunter Name, darunter kleinere Version
          const box = sel => hw?.document.querySelector(sel)?.getBoundingClientRect();
          const icon = box(".icon"), h1 = box("h1"), ver = box("#version");
          const mid = r => r ? Math.round(r.left + r.width / 2 - hw.innerWidth / 2) : null;
          const size = sel => parseFloat(hw?.getComputedStyle(hw.document.querySelector(sel)).fontSize);
          const head = icon && h1 && ver ? { offsets: [mid(icon), mid(h1), mid(ver)],
            stacked: icon.bottom <= h1.top && h1.bottom <= ver.top + 1, sizes: [size("h1"), size("#version")] } : null;
          // nicht scrollbar (früher 3 px zu niedrig); Status in deckender Farbe, sonst malt Gecko das Emoji blass
          const overflow = hw ? hw.document.documentElement.scrollHeight - hw.innerHeight : null;
          const status = hw ? hw.getComputedStyle(hw.document.getElementById("update-status")).color : null;
          // Fotos/Emojis stehen nur noch auf der Einstellungsseite
          const toggles = hw ? ["photos", "emoji"].filter(id => hw.document.getElementById(id)) : null;
          // „Settings…“ öffnet Einstellungen → halo.spaces – auch wenn schon ein Einstellungs-Tab offen ist
          w.openPreferencesTab("paneGeneral"); await wait(1500); await toMail(); await wait(300);
          hw?.document.getElementById("settings")?.click();
          const pw = await until(() => tm.currentTabInfo.mode.name == "preferencesTab" && tm.currentTabInfo.browser?.contentWindow?.document.getElementById("categories")?.selectedItem?.value == "paneMcHalo" && tm.currentTabInfo.browser.contentWindow, 8000);
          const settings = !!pw; if (pw) tm.closeTab(tm.currentTabInfo);
          w.openLinkExternally = orig; try { if (hw && !hw.closed) hw.close(); } catch {}
          return { window: !!hw, opened, address, room, head, overflow, status, toggles, settings };''')
        url = res.get("opened") or ""
        ok = url.startswith("https://buymeacoffee.com/diversion?") and "utm_content=about-window" in url
        head = res.get("head") or {}
        centered = head and all(o is not None and abs(o) <= 2 for o in head["offsets"]) and head["stacked"] and head["sizes"][1] < 12
        # Einstellungsseite (eingebettet, nicht per Marionette erreichbar): Sekundärfarbe ohne Alpha in der Datei
        import re
        opts = open(os.path.join(ROOT, "extension", "options", "options.css")).read()
        opaque = not re.search(r"--text-secondary:\s*rgba", opts) and (res.get("status") or "").startswith("rgb(")
        return (ok and centered and not res["address"] and res["room"] is not None and 16 <= res["room"] <= 22
                and res.get("overflow") is not None and res["overflow"] <= 0 and opaque and res["toggles"] == [] and res["settings"]), f"{res}"
    check("Info-Fenster: Logo, Name und Version mittig untereinander; „Say Thanks“ öffnet die Spendenseite, keine Mailadresse unten; "
          "nicht scrollbar, unten 18 px; Emojis in Status und Hinweisen in voller Farbe; ohne Fotos/Emojis, „Settings…“ öffnet Einstellungen → halo.spaces", donate, results)

    def addons_manager():
        # Add-ons-Verwaltung (Thunderbird 140+, Bausteine im Schatten-DOM): Seitenleiste 34 px/13 px, Seite und Kopf in
        # --mt-window (dunkel kein #18181B), Suchfeld als Kapsel ohne Rahmen, Werkzeug und „…“ gleich (24 × 24, ohne
        # Fläche), Schalter mit weißem Knopf, Menüs wie halo (12 px, 22-px-Zeilen, Akzent), Detailansicht mit
        # Haarlinien ohne Doppellinie, eingebettete Einstellungen ohne eigene Fläche
        res = m.js(r'''
          w.resizeTo(1500, 900);
          const ID = "mail-cards@sebastian.local";
          w.openAddonsMgr("addons://list/extension");
          const ad = await until(() => { const x = tm.currentTabInfo.browser?.contentDocument; return x?.querySelector(`addon-card[addon-id="${ID}"] .extension-options-button`) && x; }, 8000);
          await wait(800);
          const aw = ad.defaultView; const cs = (e, p) => aw.getComputedStyle(e, p); const R = e => e.getBoundingClientRect();
          const probe = (prop, v) => { const p = ad.createElement("div"); p.style[prop] = v; ad.body.append(p); const c = cs(p)[prop]; p.remove(); return c; };
          const bg = v => probe("backgroundColor", v), fg = v => probe("color", v);
          const out = {};
          const btns = [...ad.querySelectorAll("categories-box moz-page-nav-button")].map(b => b.shadowRoot?.querySelector("a[href], button")).filter(b => b && R(b).height);
          out.nav = btns.map(b => [Math.round(R(b).height), cs(b).fontSize, Math.round(R(b.querySelector(".page-nav-icon") || b).width)]);
          const sel = btns.find(b => b.matches("[selected]"));
          out.navSel = !!sel && cs(sel).backgroundColor == bg("var(--mt-selected-unfocused)");
          const win = bg("var(--mt-window)");
          out.page = [ad.documentElement, ad.querySelector(".sticky-container"), ad.querySelector(".main-search"), ad.querySelector(".main-heading")].map(e => !!e && cs(e).backgroundColor == win);
          const inp = ad.querySelector("search-addons moz-input-search")?.shadowRoot?.querySelector("#input");
          out.search = inp ? [cs(inp).borderTopColor, parseFloat(cs(inp).borderTopLeftRadius), cs(inp).backgroundColor == bg("var(--mt-control)"), Math.round(R(inp).height)] : null;
          const knobs = c => [c.querySelector(".extension-options-button"), c.querySelector(".more-options-button")?.shadowRoot?.querySelector('[part="button"]')]
            .map(b => b ? [Math.round(R(b).width * 2) / 2, Math.round(R(b).height * 2) / 2, cs(b).backgroundColor, cs(b).borderTopLeftRadius] : null);
          const card = ad.querySelector(`addon-card[addon-id="${ID}"]`);
          out.knobs = [knobs(card)];
          const tb = card.querySelector("moz-toggle")?.shadowRoot?.querySelector('button[aria-pressed="true"]');
          out.toggleDot = tb ? cs(tb, "::before").backgroundColor : null;
          out.menus = [];
          for (const [btnSel, listSel] of [[`addon-card[addon-id="${ID}"] .more-options-button`, `addon-card[addon-id="${ID}"] addon-options > panel-list`],
                                           ["addon-page-header .page-options-menu .more-options-button", "addon-page-options > panel-list"]]) {
            ad.querySelector(btnSel).click();
            const pl = await until(() => { const p = ad.querySelector(listSel); return p?.open && R(p).height && p; }, 4000);
            await wait(300);
            if (!pl) { out.menus.push(null); continue; }
            const ib = [...pl.querySelectorAll("panel-item")].find(i => !i.disabled && !i.hidden && R(i).height)?.shadowRoot.querySelector("button");
            InspectorUtils.addPseudoClassLock(ib, ":hover"); const hover = cs(ib).backgroundColor; InspectorUtils.removePseudoClassLock(ib, ":hover");
            const hr = [...pl.querySelectorAll("hr")].find(h => R(h).width);
            const back = cs(pl).backgroundColor.match(/[\d.]+/g).map(Number);
            out.menus.push({ radius: cs(pl).borderTopLeftRadius, border: cs(pl).borderTopWidth, bg: cs(pl).backgroundColor == bg("var(--mt-tooltip-bg)"),
              blue: Math.abs(back[0] - back[2]) > 6, itemRadius: cs(ib).borderTopLeftRadius, itemH: Math.round(R(ib).height),
              hover: hover == bg("var(--mt-accent)"), hr: hr ? cs(hr).borderTopColor == fg("var(--mt-separator)") : null });
            pl.hide(); await wait(300);
          }
          w.openAddonsMgr("addons://detail/" + encodeURIComponent(ID));
          const tg = await until(() => { const t = ad.querySelector("addon-details .tab-group"); return t && R(t).height && t; }, 6000); await wait(800);
          const row = [...ad.querySelectorAll('addon-details section[name="details"] > .addon-detail-row')].find(e => R(e).height > 0);
          out.detail = tg && row ? { tgBottom: cs(tg).borderBottomWidth, gap: Math.round(R(row).top - R(tg).bottom), rowLine: cs(row).borderTopColor == fg("var(--mt-separator)"),
            tgTop: cs(tg).borderTopColor == fg("var(--mt-separator)") } : null;
          out.knobs.push(knobs(ad.querySelector("addon-card")));
          w.openAddonsMgr("addons://detail/" + encodeURIComponent(ID) + "/preferences");
          const br = await until(() => { const b = ad.querySelector("addon-card .addon-inline-options"); return b && R(b).height > 100 && b; }, 8000);
          await wait(1500);
          out.inline = br ? cs(br).backgroundColor : null;
          if (br) {
            // Schnappschuss mit Magenta als Grund: ist die Seite durchsichtig, bleibt der Rand magenta
            const snap = await br.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(2, 2, 4, 4), 1, "rgb(255,0,255)");
            const cv = ad.createElement("canvas"); cv.width = snap.width; cv.height = snap.height; const cx = cv.getContext("2d"); cx.drawImage(snap, 0, 0);
            out.inlinePixel = [...cx.getImageData(1, 1, 1, 1).data];
          }
          tm.closeTab(tm.currentTabInfo); await wait(300);
          return out;''')
        nav_ok = len(res["nav"]) >= 4 and all(32 <= h <= 36 and f == "13px" and i == 18 for h, f, i in res["nav"]) and res["navSel"]
        s = res.get("search") or [None, 0, False, 0]
        search_ok = rgba_alpha(s[0]) == 0 and s[1] >= 14 and s[2] and 26 <= s[3] <= 30
        knobs_ok = all(k and all(b and b[0] == 24 and b[1] == 24 and b[2] == "rgba(0, 0, 0, 0)" and b[3] == "50%" for b in k) for k in res["knobs"])
        menus_ok = len(res["menus"]) == 2 and all(mn and mn["radius"] == "12px" and mn["border"] == "0px" and mn["bg"] and not mn["blue"]
                                                   and mn["itemRadius"] == "6px" and mn["itemH"] >= 22 and mn["hover"] and mn["hr"] is not False for mn in res["menus"])
        dt = res.get("detail") or {}
        detail_ok = dt.get("tgBottom") == "0px" and dt.get("gap") is not None and abs(dt["gap"]) <= 1 and dt.get("rowLine") and dt.get("tgTop")
        inline_ok = res.get("inline") == "rgba(0, 0, 0, 0)" and res.get("inlinePixel") == [255, 0, 255, 255]
        ok = nav_ok and all(res["page"]) and search_ok and knobs_ok and res.get("toggleDot") == "rgb(255, 255, 255)" and menus_ok and detail_ok and inline_ok
        return ok, f"{res}"
    check("Add-ons: Seitenleiste 34 px/13 px, Seite und Kopf in Fensterfarbe, Suchfeld als Kapsel, Symbolknöpfe gleich, Schalter weiß, "
          "Menüs wie macOS, Detailansicht mit Haarlinien ohne Doppellinie, Einstellungen ohne eigene Fläche", addons_manager, results)

    def tasks_view():
        # Leeranzeige, iCloud-Platzhalter ausgeblendet, Hinweis unter dem Titel im Listenkopf, Kapsel-Knöpfe
        res = m.js(r'''
          w.resizeTo(1500, 900);
          const c = testCalendar();
          tm.openTab("tasks", {}); await wait(2000);
          const tree = d.getElementById("calendar-task-tree"); const empty = d.getElementById("mcTasksEmpty");
          const field = d.getElementById("view-task-edit-field");
          const shown = () => empty && !empty.hidden;
          const out = { emptyAtStart: shown() };
          // Platzhalter, wie iCloud ihn anlegt – darf nicht erscheinen
          const ph = new CalTodo(); ph.title = "Wo sind meine Erinnerungen?"; ph.calendar = c;
          ph.setProperty("DESCRIPTION", "Weitere Infos: https://support.apple.com/HT210220"); const phSaved = await c.addItem(ph);
          await wait(1200);
          out.placeholderRows = tree.mTreeView.rowCount; out.emptyWithPlaceholder = shown();
          // Today-Pane einmal aus- und einblenden: Thunderbird löst die Liste dabei von den Kalendern –
          // neue Aufgaben müssen trotzdem sofort erscheinen
          await toMail(); const tpBtn = d.getElementById("mcTodayToggle");
          if (tpBtn) { tpBtn.click(); await wait(700); tpBtn.click(); await wait(700); }
          tm.openTab("tasks", {}); await wait(1000);
          const todo = new CalTodo(); todo.title = "Halo Testaufgabe"; todo.calendar = c; const todoSaved = await c.addItem(todo);
          await until(() => tree.mTreeView.rowCount > 0); await wait(300);
          out.rows = tree.mTreeView.rowCount; out.emptyWithTask = shown();
          tree.mTreeView.selection?.select(0); await wait(600);
          const btn = d.getElementById("task-actions-priority"); const cs = w.getComputedStyle(btn);
          out.button = [cs.borderRadius, cs.height];
          // schreibgeschützter Kalender als Standard: Hinweis in der Toolbar-Zeile neben dem Plus
          let ro = cal.manager.getCalendars().find(x => x.name == "Halo Nur Lesen");
          if (!ro) { ro = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); ro.name = "Halo Nur Lesen"; cal.manager.registerCalendar(ro); ro.readOnly = true; }
          const comp = cal.view.getCompositeCalendar(w); const before = comp.defaultCalendar;
          comp.defaultCalendar = ro; await wait(800);
          const plus = [...d.querySelectorAll("#unifiedToolbarContent > li:not([hidden])")].find(li => li.getBoundingClientRect().width > 30 && !["search-bar", "spacer"].includes(li.getAttribute("item-id")));
          const pr = plus?.getBoundingClientRect(), fr = field.getBoundingClientRect();
          await wait(300);
          out.hint = { readOnly: field.readOnly, fieldW: Math.round(fr.width), header: d.querySelector("#mcListHeader .mc-lh-count").textContent, value: field.value };
          comp.defaultCalendar = before; await wait(500);
          for (const it of [phSaved, todoSaved]) { try { await c.deleteItem(it); } catch {} }
          return out;''')
        h = res.get("hint", {})
        ok = (res["emptyAtStart"] and res["placeholderRows"] == 0 and res["emptyWithPlaceholder"] and res["rows"] == 1 and not res["emptyWithTask"]
              and res["button"][0] == "999px" and h.get("readOnly") and h.get("fieldW") == 0 and bool(h.get("value")) and h["value"] in h.get("header", ""))
        return ok, f"{res}"
    check("Aufgaben: Leeranzeige, iCloud-Platzhalter ausgeblendet, Hinweis unter dem Titel im Listenkopf, Kapseln", tasks_view, results)

    def inline_prompt():
        # Nachfragen als Kachel im Fenster (oben wie ein macOS-Sheet) statt als eigenes Fenster. Marionette bricht eine
        # offene Nachfrage beim nächsten Befehl selbst ab (und verliert dabei dessen Antwort) – darum misst und schließt
        # die Prüfung sie selbst, nachdem der erste Befehl schon zurückgekehrt ist
        m.js(r"""
          await toMail(); w.resizeTo(1500, 900); await wait(400);
          const host = d.getElementById("mcDialogBox");
          const t = w.__mcPromptTest = { host: !!host, box: !!w.gDialogBox, before: [...Services.wm.getEnumerator(null)].length, seen: null, answer: "offen" };
          if (!host) return 1;
          const onOpen = () => {
            w.removeEventListener("dialogopen", onOpen, true);
            t.seen = { open: host.open, windows: [...Services.wm.getEnumerator(null)].length - t.before };
            w.setTimeout(() => {
              const f = host.querySelector(".dialogFrame"), card = host.querySelector(".dialogBox");
              if (card) {
                const r = card.getBoundingClientRect(), cs = w.getComputedStyle(card);
                t.card = { radius: cs.borderTopLeftRadius, top: Math.round(r.top), center: Math.round(r.left + r.width / 2 - w.innerWidth / 2),
                           w: Math.round(r.width), h: Math.round(r.height), title: w.getComputedStyle(host.querySelector(".dialogTitleBar")).display };
              }
              t.text = f?.contentDocument?.getElementById("infoBody")?.textContent;
              f?.contentDocument?.querySelector("dialog")?.cancelDialog();
            }, 900);
          };
          w.addEventListener("dialogopen", onOpen, true);
          w.setTimeout(() => Services.prompt.asyncConfirm(w.browsingContext, Ci.nsIPromptService.MODAL_TYPE_INTERNAL_WINDOW, "Halo Nachfrage", "Wirklich löschen?")
            .then(bag => { t.answer = bag.getProperty("ok"); }), 100);
          return 1;""")
        time.sleep(3)
        res = m.js(r"""
          const host = d.getElementById("mcDialogBox"), t = w.__mcPromptTest || {};
          await until(() => t.answer !== "offen", 3000); await wait(300);
          delete w.__mcPromptTest;
          return { host: t.host, box: t.box, seen: t.seen, card: t.card, text: t.text, answer: t.answer, closed: !!host && !host.open };""")
        s_, c = res.get("seen") or {}, res.get("card") or {}
        ok = (res["host"] and res["box"] and s_.get("open") and s_.get("windows") == 0
              and c.get("radius") == "14px" and c.get("title") == "none" and 40 <= c.get("top", 0) <= 90
              and abs(c.get("center", 99)) <= 2 and c.get("w", 0) >= 250 and c.get("h", 0) >= 60
              and res.get("text") == "Wirklich löschen?" and res.get("answer") is False and res.get("closed"))
        return ok, f"{res}"
    check("Nachfragen: als Kachel oben im Fenster wie ein macOS-Sheet statt eigenes Fenster", inline_prompt, results)

    def card_windows():
        # Dialogfenster ohne sichtbare Titelleiste (macOS): Ordner-Eigenschaften mit Streifen oben, nichts abgeschnitten;
        # Termin-Fenster mit der Symbolleiste in der Zeile der Fensterknöpfe. Unter Windows/Linux unverändert
        res = m.js(r"""
          for (const x of [...Services.wm.getEnumerator(null)]) if (!x.location.href.includes("messenger.xhtml")) x.close();
          const waitWin = async url => { for (let i = 0; i < 60; i++) { const x = [...Services.wm.getEnumerator(null)].find(x => x.location.href.startsWith(url) && x.document.readyState == "complete"); if (x) return x; await wait(200); } return null; };
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder, folder = root.subFolders[0];
          w.openDialog("chrome://messenger/content/folderProps.xhtml", "", "chrome,modal=no,titlebar,resizable=no", { folder, serverType: "none", msgWindow: w.msgWindow, name: folder?.prettyName });
          let x = await waitWin("chrome://messenger/content/folderProps.xhtml"); await wait(2000);
          const out = { mac: Services.appinfo.OS == "Darwin" };
          if (x) {
            const r = x.document.documentElement, body = x.document.body;
            const acc = x.document.querySelector("dialog")?.getButton?.("accept");
            out.props = { card: r.hasAttribute("mc-card-window"), ct: r.getAttribute("customtitlebar"), pad: x.getComputedStyle(body).paddingTop,
                          fits: r.scrollHeight <= x.innerHeight + 1, okVisible: acc ? acc.getBoundingClientRect().bottom <= x.innerHeight + 1 : null };
            x.close();
          }
          const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
          const c = testCalendar(); const e = new CalEvent(); e.title = "Halo Kartenfenster"; e.calendar = c;
          const st = cal.dtz.now(); st.hour = 10; st.minute = 0; st.second = 0; const en = st.clone(); en.hour += 1; e.startDate = st; e.endDate = en;
          const saved = await c.addItem(e); await toCalendar(); await wait(400); w.modifyEventWithDialog(saved, true);
          x = await waitWin("chrome://calendar/content/calendar-event-dialog.xhtml"); await wait(1200);
          if (x) {
            const r = x.document.documentElement, bar = x.document.getElementById("event-toolbar");
            out.event = { card: r.hasAttribute("mc-card-window"), pad: x.getComputedStyle(x.document.body).paddingTop,
                          barStart: bar ? x.getComputedStyle(bar).paddingInlineStart : null, barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null };
            x.close(); await wait(300);
          }
          try { await c.deleteItem(saved); } catch {}
          await toMail();
          return out;""")
        p, e = res.get("props") or {}, res.get("event") or {}
        if res["mac"]:
            ok = (p.get("card") and p.get("ct") == "true" and p.get("pad") == "28px" and p.get("fits") and p.get("okVisible") is not False
                  and e.get("card") and e.get("pad") == "0px" and e.get("barStart") == "78px" and e.get("barTop") == 0)
        else:
            ok = p.get("card") is False and e.get("card") is False
        return ok, f"{res}"
    check("Dialogfenster: ohne sichtbare Titelleiste (macOS), Ordner-Eigenschaften nicht abgeschnitten, Termin-Symbolleiste neben den Fensterknöpfen", card_windows, results)

    def task_view_choice():
        # Aufgaben wie die Mailliste: „Listenansicht“ (Details rechts, nur Erledigt/Titel/Fälligkeit) oder „Tabellenansicht“
        # (alle Spalten, Details unten) im Filtermenü; im schmalen Fenster Details auch in der Liste unten
        res = m.js(r"""
          w.resizeTo(1500, 900); await wait(400);
          const c = testCalendar();
          const todo = new CalTodo(); todo.title = "Halo Ansichtsaufgabe"; todo.calendar = c; const saved = await c.addItem(todo);
          tm.openTab("tasks", {}); await wait(1500);
          const tree = d.getElementById("calendar-task-tree"), det = d.getElementById("calendar-task-details-container");
          await until(() => tree.mTreeView.rowCount > 0, 4000); tree.mTreeView.selection?.select(0); await wait(600);
          const btn = d.querySelector("#mcListHeader .mc-lh-more"), popup = d.getElementById("mcTaskFilterPopup");
          // (unter Linux/xvfb ohne Fenstermanager geht das Menü teils nicht ganz auf – dann über die Einstellung;
          // activateItem auf einem nicht offenen Menü kehrte dort nie zurück)
          const pick = async view => { btn.click(); const opened = await until(() => popup.state == "open", 2000); await wait(200);
            const it = popup.querySelector(`menuitem[data-view="${view}"]`);
            if (opened && it) it.doCommand(); else Services.prefs.setCharPref("extensions.mailcards.taskView", view);
            await wait(600); popup.hidePopup(); await wait(200); };
          const cols = () => [...tree.querySelectorAll("treecol[itemproperty]")].filter(c => !c.hidden).map(c => c.getAttribute("itemproperty"));
          const geo = () => { const t = tree.getBoundingClientRect(), r = det.getBoundingClientRect();
            return { right: r.left >= t.right - 1 && Math.abs(r.top - t.top) < 40, below: r.top >= t.bottom - 1, detW: Math.round(r.width) }; };
          const out = { start: Services.prefs.getCharPref("extensions.mailcards.taskView", "list") };
          btn.click(); await until(() => popup.state == "open", 2000); await wait(200);
          out.menu = [...popup.children].map(i => i.localName == "menuseparator" ? "-" : i.dataset.view || i.getAttribute("label"));
          popup.hidePopup(); await wait(200);
          await pick("table"); out.table = { cols: cols(), ...geo(), side: d.documentElement.hasAttribute("mc-task-side") };
          await pick("list"); out.list = { cols: cols(), ...geo(), side: d.documentElement.hasAttribute("mc-task-side") };
          w.resizeTo(820, 900); await wait(900);
          const boxW = Math.round(tree.parentElement.getBoundingClientRect().width);
          out.narrow = { boxW, side: d.documentElement.hasAttribute("mc-task-side"), ...geo() };
          w.resizeTo(1500, 900); await wait(900); out.wideAgain = d.documentElement.hasAttribute("mc-task-side");
          await pick("table"); out.tableAgain = cols();
          await pick(out.start);
          try { await c.deleteItem(saved); } catch {}
          for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          return out;""")
        t, l, n = res["table"], res["list"], res["narrow"]
        ok = (res["menu"] == ["list", "table"]
              and not t["side"] and t["below"] and "priority" in t["cols"]
              and l["side"] and l["right"] and l["cols"] == ["completed", "title", "dueDate"] and l["detW"] >= 300
              and (n["side"] == (n["boxW"] >= 760)) and (n["side"] or n["below"]) and res["wideAgain"]
              and res["tableAgain"] == t["cols"])
        return ok, f"{res}"
    check("Aufgaben: Kartenansicht mit Details rechts, Tabellenansicht wie bisher, Wahl über „…“ im Listenkopf, schmal Details unten", task_view_choice, results)

    def task_header_no_overlap():
        # ohne Auswahl (auch ohne Aufgaben) behält die Liste ihre Breite wie in der Mail: Filter und „…“ über der Liste
        # liegen nie auf Plus und Suche der Toolbar
        res = m.js(r"""
          w.resizeTo(1500, 900); await wait(400);
          tm.openTab("tasks", {}); await wait(1500);
          const tree = d.getElementById("calendar-task-tree"); tree.mTreeView?.selection?.clearSelection(); await wait(800);
          const r = e => { const b = e.getBoundingClientRect(); return b.width ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
          const hits = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
          const head = [...d.querySelectorAll("#mcListHeader button")].map(r).filter(Boolean);
          const bar = [...d.querySelectorAll("#unifiedToolbarContent > li:not([item-id='spacer'])")].map(r).filter(Boolean);
          const search = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]')?.getBoundingClientRect().width || 0;
          const out = { side: d.documentElement.hasAttribute("mc-task-side"), head: head.length, overlap: head.some(h => bar.some(t => hits(h, t))), search: Math.round(search) };
          for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          return out;""")
        ok = res["head"] >= 2 and not res["overlap"] and res["search"] >= 160
        return ok, f"{res}"
    check("Aufgaben: ohne Auswahl keine Überlappung von Filter/„…“ mit Plus und Suche der Toolbar, Suchfeld bleibt breit", task_header_no_overlap, results)

    def alarm_dialog():
        # Erinnerung wie in Apple Kalender: Kalendersymbol mit Monat und Tag, keine graue Kachel, „Alle“-Knöpfe nur bei mehreren
        res = m.js(r"""
          const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
          const { CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs");
          const c = testCalendar();
          const mk = async (title, day) => { const e = new CalEvent(); e.title = title; e.calendar = c;
            e.startDate = cal.createDateTime(`2026121${day}T140000`); e.endDate = cal.createDateTime(`2026121${day}T150000`);
            const a = new CalAlarm(); a.related = Ci.calIAlarm.ALARM_RELATED_START; a.offset = cal.createDuration("-PT15M"); a.action = "DISPLAY"; e.addAlarm(a);
            return c.addItem(e); };
          const e1 = await mk("Halo Erinnerung", 5), e2 = await mk("Halo Erinnerung 2", 6);
          const arg = { window_onLoad() {} }; arg.wrappedJSObject = arg;
          const dlg = w.openDialog("chrome://calendar/content/calendar-alarm-dialog.xhtml", "_blank", "chrome,dialog=no,all,resizable", arg);
          await until(() => dlg.document?.readyState == "complete" && typeof dlg.addWidgetFor == "function", 5000); await wait(400);
          const doc = dlg.document, cs = el => dlg.getComputedStyle(el);
          const out = {};
          try {
            dlg.addWidgetFor(e1, e1.getAlarms()[0]); await wait(700);
            const item = doc.querySelector("#alarm-richlist > richlistitem");
            const box = item?.querySelector(".mc-alarm-date");
            out.one = { month: box?.firstChild?.textContent, day: box?.lastChild?.textContent, img: item ? cs(item.querySelector(".alarm-calendar-image")).display : null,
                        bg: item ? cs(item).backgroundColor : null, allBar: cs(doc.getElementById("alarm-actionbar")).display,
                        card: doc.documentElement.hasAttribute("mc-alarm-card"), monthColor: box ? cs(box.firstChild).color : null,
                        fits: item ? item.getBoundingClientRect().bottom <= dlg.innerHeight + 1 : false };
            dlg.addWidgetFor(e2, e2.getAlarms()[0]); await wait(700);
            out.two = { allBar: cs(doc.getElementById("alarm-actionbar")).display, days: [...doc.querySelectorAll(".mc-alarm-day")].map(e => e.textContent).sort() };
          } finally {
            dlg.close(); await wait(300);
            for (const e of [e1, e2]) { try { await c.deleteItem(e); } catch {} }
          }
          out.mac = Services.appinfo.OS == "Darwin";
          return out;""")
        o, t = res.get("one", {}), res.get("two", {})
        ok = (o.get("day") == "15" and (o.get("month") or "").lower().startswith("dec") and o.get("img") == "none"
              and rgba_alpha(o.get("bg") or "rgb(0,0,0)") <= 0.06 and o.get("allBar") == "none"
              and o.get("card") == res["mac"] and o.get("fits") and same_color(o.get("monthColor"), "rgb(255, 59, 48)")
              and t.get("allBar") != "none" and t.get("days") == ["15", "16"])
        return ok, f"{res}"
    check("Kalender: Erinnerung wie in Apple Kalender (Symbol mit Monat und Tag, ohne graue Kachel, „Alle“-Knöpfe nur bei mehreren)", alarm_dialog, results)

    def tasks_details():
        # Aufgaben: Beschreibung im Detailbereich in Systemschrift 13 px ohne Body-Rand, dunkel hell lesbar (früher schwarz
        # auf #1E1E1E); Spaltenköpfe ohne zweiten Strich aus tree.css; Menüteil von „Erledigt“ als schmaler Pfeil;
        # überfällige Aufgaben rot (--mt-red), Auswahl mit Fokus ohne eckiges Fokusrechteck
        res = m.js(CAL_CHECK_JS + r'''
          w.resizeTo(1500, 900);
          const c = testCalendar();
          // Thunderbirds Liste selbst ist nur in der Tabellenansicht zu sehen (Kartenansicht: eigene Karten)
          const viewBefore = Services.prefs.getCharPref("extensions.mailcards.taskView", "");
          Services.prefs.setCharPref("extensions.mailcards.taskView", "table");
          tm.openTab("tasks", {}); await pause(1500);
          const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
          const tree = d.getElementById("calendar-task-tree");
          const todo = new CalTodo(); todo.title = "Halo Detailaufgabe"; todo.calendar = c; todo.priority = 1;
          const due = cal.dtz.now(); due.day -= 2; todo.dueDate = due;
          todo.setProperty("DESCRIPTION", "Halo Notiz"); const saved = await c.addItem(todo);
          const out = { dark };
          // Bildpunkte aus dem Fenster (Bäume malen Zeilen als Pseudo-Elemente – nur so prüfbar)
          const pixels = async r => { const cv = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            cv.width = Math.round(r.width); cv.height = Math.round(r.height); const ctx = cv.getContext("2d");
            try { const bm = await w.browsingContext.currentWindowGlobal.drawSnapshot(new w.DOMRect(r.left, r.top, r.width, r.height), 1, "white"); ctx.drawImage(bm, 0, 0); }
            catch { ctx.drawWindow(w, r.left, r.top, r.width, r.height, "white"); }
            const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
            return (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; }; };
          try {
            const row = await till(() => { for (let i = 0; i < tree.mTreeView.rowCount; i++) if (tree.mTreeView.getItemAtIndex?.(i)?.title == "Halo Detailaufgabe" || tree.getTaskAtRow?.(i)?.title == "Halo Detailaufgabe") return i + 1; return 0; }, 6000) - 1;
            out.row = row;
            if (row < 0) return out;
            tree.focus(); tree.mTreeView.selection.select(row); await pause(900);
            const frame = d.getElementById("calendar-task-details-description");
            const b = await till(() => { const x = frame.contentDocument?.body; return x && /Halo Notiz/.test(x.textContent) && x; }, 4000);
            if (b) { const cs = frame.contentWindow.getComputedStyle(b); out.desc = { font: cs.fontSize, margin: cs.marginTop, family: cs.fontFamily, color: cs.color }; }
            // Spaltenköpfe
            out.heads = [...d.querySelectorAll("#calendar-task-tree > treecols > treecol")].filter(vis).map(t => csOf(t).boxShadow);
            const pick = d.querySelector("#calendar-task-tree .tree-columnpicker-button");
            out.picker = pick ? csOf(pick).boxShadow : null;
            out.headLine = [csOf(d.querySelector("#calendar-task-tree > treecols")).borderBottomColor, csOf(d.documentElement).getPropertyValue("--mt-pane-line").trim()];
            out.red = csOf(d.documentElement).getPropertyValue("--mt-red").trim();
            // „Erledigt“: Menüteil schmal, Pfeil als Maske
            const cap = d.getElementById("task-actions-markcompleted");
            const dm = cap?.querySelector(".toolbarbutton-menubutton-dropmarker");
            out.dmInfo = dm ? { rects: dm.getClientRects().length, w: Math.round(dm.getBoundingClientRect().width), cap: Math.round(cap.getBoundingClientRect().width) } : "fehlt";
            if (dm && vis(dm)) { const a = cap.getBoundingClientRect(), r = dm.getBoundingClientRect();
              out.marker = { w: Math.round(r.width * 10) / 10, mask: csOf(dm, "::after").maskImage.slice(0, 12), gap: Math.round((a.right - r.right) * 10) / 10,
                            dy: Math.round(((r.top + r.bottom) - (a.top + a.bottom)) / 2 * 10) / 10, line: csOf(dm).borderInlineStartWidth }; }
            // ausgewählt mit Fokus: Zeilenrand links wie die Zeilenfläche daneben (kein Fokusrechteck)
            const tc = tree.querySelector("treechildren"), tr = tc.getBoundingClientRect(), rh = tree.rowHeight || 40;
            const top = tr.top + (row - tree.getFirstVisibleRow()) * rh;
            w.focus(); await till(() => Services.focus.activeWindow == w, 3000); tree.focus(); await pause(400);
            out.focused = Services.focus.activeWindow == w && (d.activeElement == tree || tree.contains(d.activeElement));
            out.rule = /treechildren::-moz-tree-row\(current, focus\)\s*\{\s*outline: none !important/.test(await (await fetch(`resource://mailcards/theme.css`)).text());
            const px1 = await pixels({ left: tr.left, top, width: 12, height: rh });
            out.edge = [px1(0, rh / 2), px1(4, rh / 2), px1(6, 0), px1(6, 3)];
            // ohne Auswahl: Text der überfälligen Zeile rot
            tree.mTreeView.selection.clearSelection(); await pause(600);
            const px2 = await pixels({ left: tr.left, top, width: Math.min(tr.width, 700), height: rh });
            let redPx = 0; for (let x = 0; x < Math.min(tr.width, 700); x++) for (let y = 4; y < rh - 4; y++) { const [r, g, bb] = px2(x, y); if (r > 200 && g < 120 && bb < 120) redPx++; }
            out.redPx = redPx;
          } finally {
            try { await c.deleteItem(saved); } catch {}
            if (viewBefore) Services.prefs.setCharPref("extensions.mailcards.taskView", viewBefore); else Services.prefs.clearUserPref("extensions.mailcards.taskView");
          }
          return out;''')
        if res.get("row", -1) < 0:
            return False, f"Aufgabe nicht in der Liste {res}"
        desc, mk = res.get("desc") or {}, res.get("marker") or {}
        fam = desc.get("family", "")
        ok_desc = (desc.get("font") == "13px" and desc.get("margin") == "0px" and ("-apple-system" in fam or "system-ui" in fam)
                   and same_color(desc.get("color", ""), "rgb(245, 245, 247)" if res["dark"] else "rgb(29, 29, 31)"))
        ok_head = (len(res["heads"]) >= 3 and all(s == "none" for s in res["heads"]) and res.get("picker") in (None, "none")
                   and same_color(res["headLine"][0], res["headLine"][1]))
        # „Erledigt“ als geteilter Knopf wie „Markieren“ in der Mail: Haken | Trennstrich | 28 px Pfeil am rechten Rand
        ok_marker = bool(mk) and mk["w"] == 28 and mk["mask"].startswith("url(") and abs(mk["gap"]) <= 1 and abs(mk["dy"]) <= 1.5 and mk["line"] == "1px"
        e = res.get("edge") or []
        diff = lambda a, b: max(abs(x - y) for x, y in zip(a, b))
        # Rand nur mit fokussiertem Fenster sichtbar (parallele Läufe nehmen den Fokus) – sonst nur die Regel prüfen
        ok_focus = res.get("rule") and (not res.get("focused") or (len(e) == 4 and diff(e[0], e[1]) <= 12 and diff(e[2], e[3]) <= 12))
        ok_red = res.get("red", "").upper() == ("#FF6961" if res["dark"] else "#FF3B30") and res.get("redPx", 0) >= 10
        ok = ok_desc and ok_head and ok_marker and ok_focus and ok_red
        return ok, f"desc={ok_desc} kopf={ok_head} pfeil={ok_marker} fokus={ok_focus} rot={ok_red} {res}"
    check("Aufgaben: Beschreibung 13 px ohne Rand und dunkel lesbar, Spaltenköpfe ohne zweiten Strich, „Erledigt“ als geteilter Knopf, überfällig rot, kein Fokusrechteck", tasks_details, results)

    def task_cards():
        # Kartenansicht der Aufgaben wie die Mail-Karten: Menü heißt „Card View“, Karten mit Radius und Trennlinie wie die
        # Mailkarten, zweizeilig (Titel, darunter Fälligkeit und Kalender), Auswahl in Akzentfarbe; Klick wählt in
        # Thunderbirds Liste (Details rechts), Kreis hakt ab; Tabellenansicht zeigt wieder Thunderbirds Liste
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900);
          const c = testCalendar();
          const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
          Services.prefs.clearUserPref("extensions.mailcards.taskView");
          const todo = new CalTodo(); todo.title = "Halo Kartenaufgabe"; todo.calendar = c; todo.priority = 1;
          const due = cal.dtz.now(); due.day += 1; due.isDate = true; todo.dueDate = due;
          const saved = await c.addItem(todo);
          const out = {};
          try {
            tm.openTab("tasks", {}); await pause(1500);
            const tree = d.getElementById("calendar-task-tree"), list = d.getElementById("mcTaskCards");
            const card = await till(() => [...(list?.children || [])].find(k => /Halo Kartenaufgabe/.test(k.textContent)), 6000);
            out.card = !!card;
            if (!card) return out;
            tree.view.selection.clearSelection(); await pause(300);
            const cs = csOf(card), r = card.getBoundingClientRect();
            out.look = { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow.includes("inset"), h: Math.round(r.height),
                         lines: card.querySelectorAll(".mc-tc-title, .mc-tc-meta").length, prio: card.querySelector(".mc-tc-prio")?.textContent,
                         meta: card.querySelector(".mc-tc-meta")?.textContent, treeShown: w.getComputedStyle(tree).opacity != "0" || w.getComputedStyle(tree).pointerEvents != "none" };
            out.mailRadius = csOf(d.documentElement).getPropertyValue("--mt-radius-row").trim();
            // Klick auf die Karte: Thunderbirds Liste wählt die Aufgabe, Details zeigen sie
            const rect = card.getBoundingClientRect();
            card.querySelector(".mc-tc-title").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: rect.left + 60, clientY: rect.top + 10 }));
            await pause(600);
            const sel = [...list.children].find(k => k.hasAttribute("aria-selected"));
            out.selected = { task: tree.currentTask?.title, card: sel?.textContent.includes("Halo Kartenaufgabe"), bg: sel && csOf(sel).backgroundColor,
                             accent: colorOf(d, "var(--mt-accent)"), focused: list.hasAttribute("data-focused"),
                             details: d.getElementById("calendar-task-details-title")?.textContent };
            // Kreis: erledigt
            const check = card.querySelector(".mc-tc-check"), cr = check.getBoundingClientRect();
            check.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: cr.left + 5, clientY: cr.top + 5 }));
            await till(async () => (await c.getItem(saved.id))?.isCompleted, 4000); await pause(500);
            out.completed = !!(await c.getItem(saved.id))?.isCompleted;
            // Menü: „Card View“ statt „List View“
            const popup = d.getElementById("mcTaskFilterPopup");
            if (popup) popup.dataset.kind = "view";
            popup?.dispatchEvent(new w.Event("popupshowing"));
            out.menu = popup ? [...popup.querySelectorAll("menuitem[data-view]")].map(i => i.getAttribute("label")) : null;
            Services.prefs.setCharPref("extensions.mailcards.taskView", "table"); await pause(600);
            out.table = { cards: list.getBoundingClientRect().height > 0, tree: tree.getBoundingClientRect().height > 50 };
          } finally {
            Services.prefs.clearUserPref("extensions.mailcards.taskView");
            try { await c.deleteItem(saved); } catch {}
            for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          }
          return out;""")
        lk, sl = res.get("look") or {}, res.get("selected") or {}
        ok = (res.get("card") and lk.get("radius") == res.get("mailRadius") and lk.get("shadow") and lk.get("lines") == 2 and lk.get("prio") == "!!!"
              and not lk.get("treeShown") and sl.get("task") == "Halo Kartenaufgabe" and sl.get("card") and sl.get("focused")
              and same_color(sl.get("bg", ""), sl.get("accent", "")) and res.get("completed") and (res.get("menu") or [None])[0] == "Card View"
              and res.get("table") == {"cards": False, "tree": True})
        return ok, f"{res}"
    check("Aufgaben: Kartenansicht wie die Mail-Karten (rund, zweizeilig, Auswahl in Akzentfarbe, Kreis hakt ab), Tabelle zeigt Thunderbirds Liste", task_cards, results)

    def task_header():
        # Aufgaben wie die Mail: Filter- und „…“-Knopf an derselben Stelle wie über der Mailliste, Titel = Filter, Anzahl;
        # Aktionen (Kategorie, Erledigt, Priorität, Löschen) oben in der Toolbar-Zeile als Symbole ohne Text, mit Tooltip
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900); await pause(600);
          const c = testCalendar();
          const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
          const todo = new CalTodo(); todo.title = "Halo Kopfaufgabe"; todo.calendar = c; const saved = await c.addItem(todo);
          const R = e => { const r = e?.getBoundingClientRect(); return r && r.width ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), b: Math.round(r.bottom) } : null; };
          const out = {};
          try {
            await toMail(); await pause(1200);
            const box = d.getElementById("mcListHeader");
            out.mail = { filter: R(box.querySelector(".mc-lh-filter")), more: R(box.querySelector(".mc-lh-more")) };
            tm.openTab("tasks", {}); await pause(1500);
            const tree = d.getElementById("calendar-task-tree");
            const i = await till(() => { const k = tree.mTaskArray.findIndex(t => t.title == "Halo Kopfaufgabe"); return k >= 0 ? k + 1 : 0; }, 5000) - 1;
            tree.focus(); tree.view.selection.select(i); await pause(1200);
            out.tasks = { filter: R(box.querySelector(".mc-lh-filter")), more: R(box.querySelector(".mc-lh-more")),
                          title: box.querySelector(".mc-lh-title").textContent, count: box.querySelector(".mc-lh-count").textContent };
            const row = d.getElementById("unifiedToolbarContainer").getBoundingClientRect();
            const bar = d.getElementById("task-actions-toolbar");
            out.actions = [...bar.children].filter(b => b.getBoundingClientRect().width).map(b => {
              const r = b.getBoundingClientRect(), txt = b.querySelector(".toolbarbutton-text");
              return { id: b.id, inRow: r.top >= row.top - 1 && r.bottom <= row.bottom + 1, text: !!txt && txt.getBoundingClientRect().width > 0,
                       icon: csOf(b.id == "task-actions-markcompleted" ? b.querySelector(".toolbarbutton-menubutton-button") : b, "::before").maskImage.includes("mailcards/icons"),
                       tip: !!(b.getAttribute("tooltiptext") || b.getAttribute("label")) }; });
            // „…“ öffnet die Ansichten, Filter-Knopf die Filter
            box.querySelector(".mc-lh-more").click(); const pop = d.getElementById("mcTaskFilterPopup"); await till(() => pop.state == "open", 3000);
            out.viewMenu = [...pop.querySelectorAll("menuitem")].map(x => x.getAttribute("label")); pop.hidePopup(); await pause(300);
            box.querySelector(".mc-lh-filter").click(); await till(() => pop.state == "open", 3000);
            out.filterMenu = pop.querySelectorAll("menuitem").length; pop.hidePopup(); await pause(300);
          } finally {
            try { await c.deleteItem(saved); } catch {}
            for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          }
          return out;""")
        mf, tf = (res.get("mail") or {}), (res.get("tasks") or {})
        same = all(mf.get(k) and tf.get(k) and abs(mf[k]["l"] - tf[k]["l"]) <= 2 and abs(mf[k]["t"] - tf[k]["t"]) <= 1 for k in ("filter", "more"))
        acts = res.get("actions") or []
        ok = (same and re.match(r"\d+ tasks?\b", tf.get("count", "")) and len(acts) == 4
              and all(a["inRow"] and not a["text"] and a["icon"] and a["tip"] for a in acts)
              and res.get("viewMenu") == ["Card View", "Table View"] and res.get("filterMenu", 0) >= 5)
        return ok, f"{res}"
    check("Aufgaben: Filter und „…“ an derselben Stelle wie in der Mail, Aktionen oben in der Toolbar als Symbole ohne Text", task_header, results)

    def tables_like_mail():
        # Tabellenansichten in Adressbuch und Aufgaben wie die Mail-Tabelle: gleiche Schrift, Zeilen- und Kopfhöhe,
        # Kopf in Fensterfarbe und leiser Schrift, Trennlinie je Zeile, jede zweite Zeile getönt (--mt-table-*);
        # Auswahl mit Fokus in Akzentfarbe (nur geprüft, wenn das Fenster den Fokus hat)
        res = m.js(MAILLIST_JS + r"""
          const out = {};
          const R = el => Math.round(el.getBoundingClientRect().height);
          const rootCs = cs(ad.documentElement);
          out.vars = ["--mt-table-font", "--mt-table-row-h", "--mt-table-head-h", "--mt-table-stripe"].map(v => rootCs.getPropertyValue(v).trim());
          // Vorgabe: Mail-Tabelle
          await showFolder(); await asTable();
          const mrow = await until(() => tableRows().find(r => r.hasAttribute("data-mc-odd") && !r.classList.contains("selected")), 5000);
          const mth = [...ad.querySelectorAll("#threadTree thead th")].find(t => t.getClientRects().length);
          out.mail = mrow && { font: cs(mrow.querySelector("td")).fontSize, rowH: R(mrow), headH: R(mth), headFont: cs(mth).fontSize,
            headColor: cs(mth).color, headBg: cs(mth).backgroundColor, line: cs(mrow).boxShadow, odd: cs(mrow).backgroundColor };
          await asCards();
          // Adressbuch (Tabellenansicht)
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          for (const n of ["Tabea Eins", "Tobias Zwei", "Theo Drei"]) if (!book.childCards.some(c => c.displayName == n)) {
            const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            c.displayName = n; c.primaryEmail = n.split(" ")[0].toLowerCase() + "@example.invalid"; book.addCard(c); }
          tm.openTab("addressBookTab", {}); await wait(2000);
          const ab = tm.currentTabInfo.browser.contentWindow, abd = ab.document, acs = el => ab.getComputedStyle(el);
          ab.cardsPane.toggleLayout(true); await wait(1500);
          try {
            const rows = () => [...abd.querySelectorAll('#cards tr[is="ab-table-card-row"]')];
            const odd = await until(() => rows().find(r => r.hasAttribute("data-mc-odd") && !r.classList.contains("selected")), 5000);
            const th = [...abd.querySelectorAll("#cards thead th")].find(t => t.getClientRects().length);
            out.ab = odd && th && { font: acs(odd.querySelector("td")).fontSize, rowH: R(odd), headH: R(th), headFont: acs(th).fontSize,
              headColor: acs(th).color, headBg: acs(th).backgroundColor, line: acs(odd).boxShadow, odd: acs(odd).backgroundColor,
              even: acs(rows().find(r => !r.hasAttribute("data-mc-odd") && !r.classList.contains("selected"))).backgroundColor };
            const list = abd.getElementById("cards");
            w.focus(); tm.currentTabInfo.browser.focus(); list.focus(); list.selectedIndex = 0; await wait(500);
            const sel = rows().find(r => r.classList.contains("selected"));
            out.abFocus = list.matches(":focus-within") && Services.focus.activeWindow == w;
            out.abSel = sel && [acs(sel).backgroundColor, acs(sel).color, accent];
          } finally { ab.cardsPane.toggleLayout(false); await wait(800); tm.closeTab(tm.currentTabInfo); }
          // Aufgaben (Tabellenansicht)
          const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
          const c = testCalendar(), saved = [];
          for (const t of ["Halo Tabelle 1", "Halo Tabelle 2", "Halo Tabelle 3"]) { const x = new CalTodo(); x.title = t; x.calendar = c; saved.push(await c.addItem(x)); }
          tm.openTab("tasks", {}); await wait(1500);
          const tree = d.getElementById("calendar-task-tree");
          const btn = d.querySelector("#mcListHeader .mc-lh-more"), popup = d.getElementById("mcTaskFilterPopup");
          // (unter Linux/xvfb ohne Fenstermanager geht das Menü teils nicht ganz auf – dann über die Einstellung;
          // activateItem auf einem nicht offenen Menü kehrte dort nie zurück)
          const pick = async view => { btn.click(); const opened = await until(() => popup.state == "open", 2000); await wait(200);
            const it = popup.querySelector(`menuitem[data-view="${view}"]`);
            if (opened && it) it.doCommand(); else Services.prefs.setCharPref("extensions.mailcards.taskView", view);
            await wait(600); popup.hidePopup(); await wait(200); };
          const start = Services.prefs.getCharPref("extensions.mailcards.taskView", "list");
          const pixels = async r => { const cv = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            cv.width = Math.round(r.width); cv.height = Math.round(r.height); const ctx = cv.getContext("2d");
            try { const bm = await w.browsingContext.currentWindowGlobal.drawSnapshot(new w.DOMRect(r.left, r.top, r.width, r.height), 1, "white"); ctx.drawImage(bm, 0, 0); }
            catch { ctx.drawWindow(w, r.left, r.top, r.width, r.height, "white"); }
            const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
            return (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; }; };
          try {
            await pick("table");
            await until(() => tree.mTreeView.rowCount >= 3, 4000);
            tree.mTreeView.selection.clearSelection(); tree.scrollToRow?.(0); await wait(600);
            const col = [...tree.querySelectorAll("treecol")].find(t => t.getClientRects().length && t.getAttribute("itemproperty") == "title");
            const tc = tree.querySelector("treechildren").getBoundingClientRect(), rh = tree.rowHeight;
            const first = tree.getFirstVisibleRow();
            // Zeilenfarbe rechts in der Zeile (kein Text), je eine gerade und eine ungerade Zeile
            const px = await pixels({ left: tc.right - 30, top: tc.top, width: 20, height: rh * 2 });
            const at = row => px(10, (row - first) * rh + rh / 2);
            out.tasks = { list: d.documentElement.hasAttribute("mc-task-list"), rowH: rh, headFont: csOf(col).fontSize, headH: R(col),
              headColor: csOf(col).color, even: at(first % 2 ? first + 1 : first), odd: at(first % 2 ? first : first + 1), first };
          } finally {
            await pick(start);
            for (const x of saved) { try { await c.deleteItem(x); } catch {} }
            for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
          }
          return out;""".replace("csOf(", "w.getComputedStyle("))
        mail, ab, t = res.get("mail") or {}, res.get("ab") or {}, res.get("tasks") or {}
        font, rowh, headh, stripe = (res.get("vars") or [""] * 4)
        if not (mail and ab and t):
            return False, f"{res}"
        rgb = lambda c: [float(x) for x in re.findall(r"[\d.]+", c)]
        # erwartete Farbe der ungeraden Aufgabenzeile: Fensterfarbe mit der Tönung darüber
        win, st = rgb(mail["headBg"]), rgb(stripe)
        want = [st[i] * st[3] + win[i] * (1 - st[3]) for i in range(3)] if len(st) == 4 and len(win) >= 3 else None
        ok_mail = mail["font"] == font and mail["rowH"] == int(rowh.rstrip("px") or 0) and mail["headH"] == int(headh.rstrip("px") or 0)
        ok_ab = all(ab[k] == mail[k] for k in ("font", "rowH", "headH", "headFont")) and same_color(ab["headColor"], mail["headColor"]) \
            and same_color(ab["headBg"], mail["headBg"]) and ab["line"] == mail["line"] and same_color(ab["odd"], mail["odd"]) and rgba_alpha(ab["even"]) == 0
        sel = res.get("abSel")
        ok_sel = not res.get("abFocus") or (bool(sel) and same_color(sel[0], sel[2]))
        ok_tasks = (not t["list"] and t["rowH"] == mail["rowH"] and t["headFont"] == mail["font"] and abs(t["headH"] - mail["headH"]) <= 1
                    and same_color(t["headColor"], mail["headColor"]) and want is not None
                    and max(abs(a - b) for a, b in zip(t["odd"], want)) <= 3 and max(abs(a - b) for a, b in zip(t["even"], win)) <= 3)
        ok = ok_mail and ok_ab and ok_sel and ok_tasks
        return ok, f"mail={ok_mail} adressbuch={ok_ab} auswahl={ok_sel} aufgaben={ok_tasks} erwartet={want} {res}"
    check("Bereiche: Tabellen in Adressbuch und Aufgaben wie die Mail-Tabelle (Schrift, Zeilen- und Kopfhöhe, Trennlinien, getönte Zeilen, Auswahl)", tables_like_mail, results)

    def tasks_list_states():
        # erledigte Aufgaben aufrecht (Thunderbird: kursiv) mit Kreis in der Systemakzentfarbe statt fest #007AFF;
        # ohne Auswahl kein Teiler über der Statusleiste (früher zwei Haarlinien); Leeranzeige bei Suche ohne Treffer
        # „No Results“ statt „No Tasks“; Kalenderliste im niedrigen Fenster ≥ 3 Zeilen, Monatskalender weicht
        res = m.js(CAL_CHECK_JS + r"""
          w.resizeTo(1500, 900);
          const c = testCalendar();
          tm.openTab("tasks", {}); await pause(1500);
          const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
          const tree = d.getElementById("calendar-task-tree");
          const out = {};
          const theme = await (await fetch("resource://mailcards/theme.css")).text();
          const ruleOf = sel => { const i = theme.indexOf(sel + " {"); return i < 0 ? "" : theme.slice(i, theme.indexOf("}", i)); };
          out.italic = /font-style: normal !important/.test(ruleOf(".calendar-task-tree treechildren::-moz-tree-cell-text(completed)"));
          const doneRule = ruleOf(".calendar-task-tree > treechildren::-moz-tree-image(calendar-task-tree-col-completed, completed)");
          out.doneRule = !/007AFF/i.test(doneRule) && doneRule.includes("resource://mailcards/icons/task-done.svg") && /fill: var\(--mt-accent\)/.test(doneRule);
          out.svg = /context-fill/.test(await (await fetch("resource://mailcards/icons/task-done.svg")).text());
          const pixels = async r => { const cv = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            cv.width = Math.round(r.width); cv.height = Math.round(r.height); const ctx = cv.getContext("2d");
            try { const bm = await w.browsingContext.currentWindowGlobal.drawSnapshot(new w.DOMRect(r.left, r.top, r.width, r.height), 1, "white"); ctx.drawImage(bm, 0, 0); }
            catch { ctx.drawWindow(w, r.left, r.top, r.width, r.height, "white"); }
            const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
            return (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; }; };
          const todo = new CalTodo(); todo.title = "Halo Erledigt"; todo.calendar = c;
          const saved = await c.addItem(todo);
          const done = saved.clone(); done.isCompleted = true; const savedDone = await c.modifyItem(done, saved);
          const prevAccent = Services.prefs.getStringPref("ui.accentcolor", "");
          const comp = cal.view.getCompositeCalendar(w), prevDefault = comp.defaultCalendar;
          try {
            // Filter „Alle“, damit die erledigte Aufgabe in der Liste steht
            d.getElementById("opt_all_filter")?.click(); await pause(800);
            const row = await till(() => { for (let i = 0; i < tree.mTreeView.rowCount; i++) if (tree.getTaskAtRow?.(i)?.title == "Halo Erledigt") return i + 1; return 0; }, 6000) - 1;
            out.row = row;
            if (row >= 0) {
              // andere Akzentfarbe (Rosa) – der Kreis muss ihr folgen
              Services.prefs.setStringPref("ui.accentcolor", "#FF2D55"); await pause(800);
              out.accent = colorOf(d, "AccentColor");
              tree.mTreeView.selection.clearSelection(); tree.ensureRowIsVisible(row); await pause(500);
              const col = tree.columns.getNamedColumn("calendar-task-tree-col-completed");
              const tc = tree.querySelector("treechildren").getBoundingClientRect();
              const cr = tree.getCoordsForCellItem(row, col, "image");
              out.cell = [Math.round(cr.x), Math.round(cr.y), Math.round(cr.width), Math.round(cr.height)];
              const px = await pixels({ left: tc.left, top: tc.top + (row - tree.getFirstVisibleRow()) * (tree.rowHeight || 40), width: 120, height: tree.rowHeight || 40 });
              // kräftigstes Pixel im Kästchenbereich (weißer Haken ausgenommen)
              let best = null, sat = -1;
              for (let x = 0; x < 120; x++) for (let y = 0; y < (tree.rowHeight || 40); y++) { const p = px(x, y); const s = Math.max(...p) - Math.min(...p); if (s > sat) { sat = s; best = p; } }
              out.circle = best;
            }
            // ohne Auswahl: in der Tabelle kein Teiler (sonst zwei Linien unten), in der Listenansicht bleibt die
            // leere Detailspalte samt Teiler stehen wie in der Mail; mit Auswahl Teiler und Details sichtbar
            tree.mTreeView.selection.clearSelection(); await pause(500);
            const sp = d.getElementById("calendar-task-view-splitter"), det = d.getElementById("calendar-task-details-container");
            out.splitNone = csOf(sp).display; out.side = d.documentElement.hasAttribute("mc-task-side");
            if (row >= 0) { tree.mTreeView.selection.select(row); await pause(600); }
            out.splitSel = [csOf(sp).display, vis(det)];
            // Suche ohne Treffer
            const f = d.getElementById("task-text-filter-field"), box = d.getElementById("mcTasksEmpty");
            f.value = "xyzxyz"; f.dispatchEvent(new w.Event("input", { bubbles: true })); f.dispatchEvent(new w.Event("command"));
            await till(() => tree.mTreeView.rowCount == 0, 4000); await pause(400);
            out.search = [tree.mTreeView.rowCount, !box.hidden, box.querySelector(".mc-te-title")?.textContent, box.querySelector(".mc-te-text")?.textContent];
            f.value = ""; f.dispatchEvent(new w.Event("input", { bubbles: true })); f.dispatchEvent(new w.Event("command"));
            await till(() => tree.mTreeView.rowCount > 0, 4000); await pause(400);
            out.cleared = [tree.mTreeView.rowCount, box.hidden, box.querySelector(".mc-te-title")?.textContent];
            // Filter „Überfällig“ ohne Treffer: kein Versprechen „Tasks you add appear here.“ (dort erscheinen sie nicht);
            // Filter „Offen“ ohne Treffer (nur die erledigte Aufgabe): wieder der Normaltext
            // beschreibbarer Standardkalender, sonst gilt „No Task List Selected“ vorrangig
            comp.defaultCalendar = c; w.taskEdit?.callOnBlurForAllTaskFields(); await pause(300);
            d.getElementById("opt_overdue_filter")?.click();
            await till(() => tree.mTreeView.rowCount == 0, 4000); await pause(500);
            out.overdue = [tree.mTreeView.rowCount, !box.hidden, box.querySelector(".mc-te-title")?.textContent, box.querySelector(".mc-te-text")?.textContent];
            d.getElementById("opt_open_filter")?.click();
            await till(() => tree.mTreeView.rowCount == 0 && tree.getAttribute("filterValue") == "open", 4000); await pause(500);
            out.open = [tree.mTreeView.rowCount, !box.hidden, box.querySelector(".mc-te-text")?.textContent];
            d.getElementById("opt_all_filter")?.click(); await till(() => tree.mTreeView.rowCount > 0, 4000); await pause(300);
            // niedriges Fenster: Kalenderliste mindestens drei Zeilen, Monatskalender ausgeblendet oder ganz darunter
            w.resizeTo(1136, 700); await pause(1000);
            const list = d.getElementById("calendar-list"), mm = d.getElementById("minimonth-pane");
            const lr = list.getBoundingClientRect(), mr = mm.getBoundingClientRect();
            out.low = { h: list.clientHeight, mm: csOf(mm).display, mmTop: Math.round(mr.top), mmBottom: Math.round(mr.bottom), listBottom: Math.round(lr.bottom), win: w.innerHeight };
            w.resizeTo(1500, 900); await pause(1000);
            out.high = { mm: csOf(mm).display, vis: vis(mm), h: list.clientHeight };
          } finally {
            if (prevAccent) Services.prefs.setStringPref("ui.accentcolor", prevAccent); else Services.prefs.clearUserPref("ui.accentcolor");
            d.getElementById("opt_throughcurrent_filter")?.click();
            if (prevDefault) { comp.defaultCalendar = prevDefault; w.taskEdit?.callOnBlurForAllTaskFields(); }
            w.resizeTo(1500, 900);
            try { await c.deleteItem(savedDone); } catch {}
          }
          return out;""")
        if res.get("row", -1) < 0:
            return False, f"erledigte Aufgabe nicht in der Liste {res}"
        ci = res.get("circle") or [0, 0, 0]
        ok_static = res.get("italic") and res.get("doneRule") and res.get("svg")
        # Rosa (#FF2D55) dominiert: Rot deutlich vor Blau und Grün
        ok_circle = ci[0] > 180 and ci[0] - ci[2] > 60 and ci[0] - ci[1] > 100
        ok_split = (res.get("splitNone") == "none") != bool(res.get("side")) and res["splitSel"][0] != "none" and res["splitSel"][1]
        se, cl = res.get("search") or [], res.get("cleared") or []
        ok_search = len(se) == 4 and se[0] == 0 and se[1] and se[2] == "No Results" and se[3] == "No tasks match your search." and cl[0] > 0 and cl[1]
        ov, op = res.get("overdue") or [], res.get("open") or []
        ok_filter = (len(ov) == 4 and ov[0] == 0 and ov[1] and ov[2] == "No Tasks" and ov[3] == "No tasks in this view."
                     and len(op) == 3 and op[0] == 0 and op[1] and op[2] == "Tasks you add appear here.")
        lo, hi = res.get("low") or {}, res.get("high") or {}
        ok_low = lo.get("h", 0) >= 90 and (lo.get("mm") == "none" or lo["mmTop"] >= lo["listBottom"]) and hi.get("mm") != "none" and hi.get("vis")
        ok = bool(ok_static and ok_circle and ok_split and ok_search and ok_filter and ok_low)
        return ok, f"statisch={ok_static} kreis={ok_circle} teiler={ok_split} suche={ok_search} filter={ok_filter} niedrig={ok_low} {res}"
    check("Aufgaben: erledigt aufrecht mit Kreis in Akzentfarbe, ohne Auswahl kein Teiler, „No Results“ bei Suche, Leeranzeige je Filter, Kalenderliste im niedrigen Fenster", tasks_list_states, results)

    def tasks_hint():
        # Eingabehinweis bleibt grau, auch wenn Thunderbird ihn ohne focus/blur neu setzt (Wechsel des Standardkalenders);
        # Hinweis „schreibgeschützter Kalender“ im schmalen Fenster endet vor dem Suchfeld (früher über Lupe und „Search“)
        res = m.js(CAL_CHECK_JS + r'''
          w.resizeTo(1500, 900);
          tm.openTab("tasks", {}); await pause(1500);
          const field = d.getElementById("view-task-edit-field"), tree = d.getElementById("calendar-task-tree");
          let ro = cal.manager.getCalendars().find(x => x.name == "Halo Nur Lesen");
          if (!ro) { ro = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); ro.name = "Halo Nur Lesen"; cal.manager.registerCalendar(ro); ro.readOnly = true; }
          const comp = cal.view.getCompositeCalendar(w); const before = comp.defaultCalendar;
          const out = {};
          try {
            tree.focus(); field.removeAttribute("mc-hint");
            comp.defaultCalendar = ro; await pause(500);
            comp.defaultCalendar = testCalendar(); await pause(600);
            out.hint = { shows: field.showsInstructions, attr: field.hasAttribute("mc-hint"), color: csOf(field).color,
                         tertiary: colorOf(d, "var(--mt-text-tertiary)"), focused: d.activeElement == field };
            w.resizeTo(1136, 760); await pause(900);
            comp.defaultCalendar = ro; await pause(900);
            const sb = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]:not([hidden])')?.getBoundingClientRect();
            const fr = field.getBoundingClientRect();
            const cnt = d.querySelector("#mcListHeader .mc-lh-count");
            out.narrow = { readOnly: field.readOnly, fieldW: Math.round(fr.width), search: sb?.width ? Math.round(sb.left) : null,
                           header: cnt.textContent, value: field.value, headerRight: Math.round(cnt.getBoundingClientRect().right) };
          } finally { comp.defaultCalendar = before; w.resizeTo(1500, 900); await pause(800); }
          return out;''')
        h, n = res.get("hint", {}), res.get("narrow", {})
        ok_hint = h.get("shows") and h.get("attr") and same_color(h.get("color", ""), h.get("tertiary", "x"))
        # Hinweis jetzt unter dem Titel im Listenkopf (wie Apple Erinnerungen), nicht mehr in der Toolbar-Zeile
        ok_narrow = (n.get("readOnly") and n.get("search") is not None and n["fieldW"] == 0 and bool(n.get("value"))
                     and n["value"] in n.get("header", "") and n["headerRight"] <= n["search"])
        return bool(ok_hint and ok_narrow), f"{res}"
    check("Aufgaben: Eingabehinweis grau auch nach Kalenderwechsel, Hinweis „schreibgeschützt“ unter dem Titel im Listenkopf", tasks_hint, results)

    def task_dialog():
        # Aufgaben-Dialog (calendar-task-dialog-inner) im selben Stil wie der Termin-Dialog: Felder grau ohne Rahmen, 32 px,
        # Fläche --mt-window; Haken aus chrome:// (CSP sperrt data:); Zeitkopplung als Kettensymbol aus chrome:// ohne
        # alte untere Klammer „↵“; Trennlinien als Haarlinie – Klammer und Kette auch im Termin-Dialog
        res = m.js(CAL_CHECK_JS + r'''
          const others = () => [...Services.wm.getEnumerator(null)].filter(x => !x.closed && !x.location.href.includes("messenger.xhtml"));
          for (const x of others()) x.close();
          await till(() => !others().length, 4000);
          const out = { dark };
          // nur ein neu geöffnetes Fenster (ein eben geschlossenes kann noch in der Liste stehen)
          const inner = async (open, ready) => {
            const before = new Set(Services.wm.getEnumerator(null));
            open();
            const dw = await till(() => [...Services.wm.getEnumerator(null)].find(x => !before.has(x) && !x.closed && x.location.href.includes("calendar-event-dialog.xhtml") && x.document.readyState == "complete"), 10000);
            if (!dw) return null;
            const iw = await till(() => { const f = dw.document.getElementById("calendar-item-panel-iframe")?.contentWindow;
              return f?.document.readyState == "complete" && f.document.getElementById(ready) && f; }, 8000);
            await pause(1200); return [dw, iw ? dw.document.getElementById("calendar-item-panel-iframe").contentDocument : null];
          };
          const link = id => { const kb = id.getElementById("keepduration-button"), lb = id.getElementById("link-image-bottom");
            const st = kb ? csOf(kb, "::before") : null;
            const kr = kb?.getBoundingClientRect(), sr = id.getElementById("event-grid-startdate-row")?.getBoundingClientRect();
            // Dauer bleibt immer gekoppelt (wie Apple Kalender): Knopf an und unsichtbar
            return { bottom: lb ? csOf(lb).display : null, keep: kb?.getAttribute("keep"), vis: kb ? csOf(kb).visibility : null }; };
          // Beschreibung ganz im Fenster (früher im Aufgaben-Fenster unten abgeschnitten); Zahlenfeld ohne Pfeile
          const fits = id => { const e = id.getElementById("item-description"); const r = e?.getBoundingClientRect();
            return r ? [Math.round(r.bottom), Math.round(id.body.getBoundingClientRect().bottom), Math.round(r.height)] : null; };
          let dw = null;
          try {
            await toCalendar();
            let r = await inner(() => w.createTodoWithDialog(testCalendar(), null, "Halo Aufgabendialog"), "todo-has-duedate");
            if (!r || !r[1]) return { dialog: false };
            [dw] = r; const id = r[1];
            out.id = id.documentElement.id;
            const t = id.getElementById("item-title"), pc = id.getElementById("percent-complete-textbox"), cat = id.getElementById("item-categories");
            // Thunderbird setzt den Fokus ins Titelfeld – fokussiert ist es gewollt weiß (unter macOS ist das Testfenster meist nicht vorn)
            if (t.matches(":focus")) { t.blur(); await pause(200); }
            out.title = { border: csOf(t).borderTopStyle, h: csOf(t).height, bg: csOf(t).backgroundColor, cat: cat ? csOf(cat).backgroundColor : null };
            out.percent = pc ? { h: Math.round(pc.getBoundingClientRect().height), border: csOf(pc).borderTopStyle } : null;
            out.bg = [csOf(id.documentElement).backgroundColor, colorOf(id, "var(--mt-window)", "backgroundColor")];
            const cb = id.getElementById("todo-has-duedate"); cb.checked = true; await pause(300);
            const ck = cb.querySelector(".checkbox-check");
            out.check = ck ? [csOf(ck).backgroundImage.slice(0, 20), csOf(ck).backgroundColor] : null;
            out.taskLink = link(id); out.taskDesc = fits(id); out.spin = pc ? csOf(pc).appearance : null;
            out.seps = [...id.querySelectorAll("tr.separator > td")].filter(vis).map(td => [csOf(td).borderBottomColor, csOf(td).borderBottomWidth]);
            dw.close(); await till(() => dw.closed, 4000);
            r = await inner(() => w.createEventWithDialog(testCalendar(), null, null, "Halo Termindialog Kette"), "event-all-day");
            if (r && r[1]) { [dw] = r; const ed = r[1]; const ad = ed.getElementById("event-all-day"); ad.checked = true; await pause(300);
              const ac = ad.querySelector(".checkbox-check"); out.eventCheck = ac ? csOf(ac).backgroundImage.slice(0, 20) : null; ad.checked = false;
              out.eventLink = link(ed); out.eventDesc = fits(ed); }
          } finally { if (dw && !dw.closed) { dw.close(); await till(() => dw.closed, 4000); } }
          return out;''')
        if res.get("dialog") is False:
            return False, "Aufgaben-Dialog nicht offen"
        t, p, bg = res.get("title") or {}, res.get("percent") or {}, res.get("bg") or ["", "x"]
        lk = lambda x: bool(x) and x["bottom"] == "none" and x["keep"] == "true" and x["vis"] == "hidden"
        fit = lambda x: bool(x) and x[0] <= x[1] - 4 and x[2] >= 40
        seps = res.get("seps") or []
        ok = (res.get("id") == "calendar-task-dialog-inner" and t.get("border") == "none" and t.get("h") == "32px" and same_color(t.get("bg", ""), t.get("cat") or "x")
              and p.get("h") == 32 and p.get("border") == "none" and same_color(bg[0], bg[1])
              and res.get("check") and res["check"][0].startswith('url("chrome://') and rgba_alpha(res["check"][1]) > 0
              and (res.get("eventCheck") or "").startswith('url("chrome://')
              and lk(res.get("taskLink")) and lk(res.get("eventLink")) and fit(res.get("taskDesc")) and fit(res.get("eventDesc"))
              and res.get("spin") == "textfield"
              and len(seps) >= 2 and all(rgba_alpha(c) <= 0.12 and float(wd[:-2]) <= 1 for c, wd in seps))
        return ok, f"{res}"
    check("Aufgaben-Dialog: Felder und Fläche wie im Termin-Dialog, Haken sichtbar, Dauer immer gekoppelt ohne sichtbaren Knopf (auch Termin-Dialog), Trennlinien als Haarlinie", task_dialog, results)

    def month_spans():
        # mehrtägige ganztägige Termine als durchgehender Balken; Titel läuft über alle Stücke weiter (früher nach
        # einer Spalte „Konferenz in Wi…“); Kalendersymbol ohne Emoji
        res = m.js(r'''
          w.resizeTo(1500, 900);
          const c = testCalendar();
          const mk = async (title, dd, days) => { const e = new CalEvent(); e.title = title; e.calendar = c;
            const s = cal.createDateTime(); s.resetTo(2026, 9, dd, 0, 0, 0, cal.dtz.floating); s.isDate = true; const en = s.clone(); en.day += days;
            e.startDate = s; e.endDate = en; return await c.addItem(e); };
          const made = [await mk("Halo Mehrtagig Konferenz in Wien", 23, 4), await mk("Qwrtz Abgabe", 27, 1)];
          await toCalendar(); w.switchToView("month"); w.currentView().goToDay(cal.createDateTime("20261015")); await wait(1500);
          const all = [...d.querySelectorAll("calendar-month-day-box-item")];
          const parts = all.filter(e => e.occurrence?.title == "Halo Mehrtagig Konferenz in Wien").map(e => { const b = e.getBoundingClientRect();
            const lab = e.querySelector(".event-name-label"), cs = w.getComputedStyle(lab);
            return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), jl: e.hasAttribute("data-mc-join-l"), jr: e.hasAttribute("data-mc-join-r"),
                     ll: Math.round(lab.getBoundingClientRect().left * 10) / 10, vis: cs.visibility, indent: parseFloat(cs.textIndent), ov: cs.textOverflow }; });
          const plain = all.find(e => e.occurrence?.title == "Qwrtz Abgabe")?.querySelector(".event-name-label");
          const icon = plain ? w.getComputedStyle(plain, "::before").maskImage : null;
          for (const e of made) { try { await c.deleteItem(e); } catch {} }
          return { parts, icon: (icon || "").slice(0, 20), emoji: plain?.getAttribute("data-mc-emoji") };''')
        p = res["parts"]
        # Fr–Mo über einen Wochenwechsel: je Zeile zusammenhängend, an den Zeilenenden
        # gerundet – wo die Zeile umbricht, hängt vom Wochenbeginn ab (Mo bzw. So unter en-US)
        rows = [sorted((q for q in p if q["t"] == t), key=lambda q: q["l"]) for t in sorted({q["t"] for q in p})]
        joined = len(p) == 4 and len(rows) == 2 and all(
            not r[0]["jl"] and not r[-1]["jr"]
            and all(abs(r[i + 1]["l"] - r[i]["r"]) <= 2 and r[i]["jr"] and r[i + 1]["jl"] for i in range(len(r) - 1))
            for r in rows)
        # Folgestücke: Titel sichtbar, um den Abstand zum ersten Stück eingerückt; Stücke mit Fortsetzung schneiden ohne „…“
        flow = joined and all(
            all(q["vis"] == "visible" and abs(q["indent"] + (q["ll"] - r[0]["ll"])) <= 1 for q in r[1:])
            and all(q["ov"] == "clip" for q in r[:-1])
            for r in rows)
        return joined and flow and res["icon"].startswith("url(") and not res["emoji"], f"{res}"
    check("Kalender: mehrtägige Termine als Balken, Titel läuft über alle Stücke weiter, Kalendersymbol ohne Emoji", month_spans, results)

    def month_more():
        # volle Tage zeigen „+N weitere“ – danach bleibt die Ansicht ruhig (früher setzte
        # update() den Text in jedem Bild neu und lief so endlos, Dauerlast auf der CPU)
        res = m.js(r'''
          w.resizeTo(1500, 900);
          const c = testCalendar(); const made = [];
          for (let i = 0; i < 9; i++) { const e = new CalEvent(); e.title = "Halo Voll " + i; e.calendar = c;
            const s = cal.createDateTime(); s.resetTo(2026, 9, 14, 8 + i, 0, 0, cal.dtz.defaultTimezone); const en = s.clone(); en.hour += 1;
            e.startDate = s; e.endDate = en; made.push(await c.addItem(e)); }
          await toCalendar(); w.switchToView("month"); w.currentView().goToDay(cal.createDateTime("20261014"));
          const more = await until(() => d.querySelector("#month-view .mc-more"));
          let changes = null;
          if (more) {
            await wait(600); changes = 0;
            const mo = new w.MutationObserver(rs => { changes += rs.filter(r => (r.target.closest ? r.target : r.target.parentElement)?.closest(".mc-more")).length; });
            mo.observe(d.getElementById("month-view"), { childList: true, subtree: true, characterData: true });
            await wait(1500); mo.disconnect();
          }
          const text = more?.textContent;
          // der volle Tag rollt nicht selbst (ab Thunderbird 159 liegt die Liste in
          // einem eigenen Rollbereich, den macOS sonst ans Mausrad bindet)
          const day = d.querySelector("#month-view calendar-month-day-box[mc-has-more]");
          const scroll = day && w.getComputedStyle(day.querySelector(".calendar-month-day-box-scroll") || day.querySelector(".calendar-month-day-box-list")).overflowY;
          for (const e of made) { try { await c.deleteItem(e); } catch {} }
          return { text, changes, scroll, visibility: d.visibilityState };''')
        if res["text"] is None and res["visibility"] == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        return (bool(res["text"]) and res["text"].startswith("+") and res["changes"] == 0
                and res["scroll"] == "hidden"), f"{res}"
    check("Kalender: „+N weitere“ in der Monatsansicht ohne Endlosschleife, volle Tage rollen nicht", month_more, results)

    def mail_search():
        # Suchfeld oben: alle Postfächer, Datum („12.10“), Trefferzahl, gelbe Markierung, zurück beim Leeren
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Suchtest")) { root.createSubfolder("Suchtest", null); await wait(800); }
          const f = root.getChildNamed("Suchtest"); const lf = f.QueryInterface(Ci.nsIMsgLocalMailFolder);
          const mail = (n, date, subject, body) => `From: Shop <shop@example.invalid>\r\nTo: Halo <h@example.invalid>\r\nSubject: ${subject}\r\nDate: ${date}\r\nMessage-ID: <halo-search-${n}@example.invalid>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n`;
          if (!f.getTotalMessages(false)) {
            lf.addMessage(mail(1, "Thu, 15 Oct 2026 16:30:00 +0200", "Versendet: Paket", "Lieferung am 12.10 erfolgt, danke."));
            lf.addMessage(mail(2, "Mon, 12 Oct 2026 09:00:00 +0200", "Rechnung Oktober", "Ihre Rechnung."));
            lf.addMessage(mail(3, "Tue, 13 Oct 2026 09:00:00 +0200", "Ganz anderes Thema", "Nichts zu sehen."));
            await wait(1000);
          }
          const a3 = await toMail(); a3.displayFolder(f.URI); await wait(1000);
          const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const fire = (type, text) => bar.dispatchEvent(new CustomEvent(type, { detail: text, cancelable: true }));
          const header = () => d.querySelector("#mcListHeader .mc-lh-count")?.textContent;
          const subjects = () => { const v = a3.gDBView; const r = []; for (let i = 0; i < (v?.rowCount || 0); i++) r.push(v.getMsgHdrAt(i).subject); return r.sort(); };
          const out = {};
          fire("search", "12.10"); await until(() => a3.gDBView?.rowCount >= 2, 6000); await wait(500);
          out.date = subjects(); out.count = header();
          fire("search", "rechnung"); await until(() => a3.gDBView?.rowCount == 1, 6000); await wait(800);
          out.text = subjects();
          out.marks = [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"] mark.mc-hit')].map(e => e.textContent);
          out.visible = (() => { const row = a3.folderPane?.getRowForFolder?.(a3.gFolder.URI); return row ? Math.round(row.getBoundingClientRect().height) : 0; })();
          fire("autocomplete", ""); await wait(1500);
          out.back = a3.gFolder?.name; out.marksAfter = a3.document.querySelectorAll("mark.mc-hit").length;
          return out;""")
        ok = (res["date"] == ["Rechnung Oktober", "Versendet: Paket"] and "2" in (res["count"] or "")
              and res["text"] == ["Rechnung Oktober"] and res["visible"] == 0 and res["back"] == "Suchtest" and not res["marksAfter"])
        # Markierung braucht gezeichnete Karten (verdecktes Testfenster: übersprungen)
        visible = m.js("return d.visibilityState;") == "visible"
        if visible:
            ok = ok and any(t.lower() == "rechnung" for t in res["marks"])
        return ok, f"{res}"
    check("Suche: alle Postfächer, Datum, Trefferzahl, Markierung, zurück zum Ordner", mail_search, results)

    def search_placeholder():
        # Suchfeld oben: Platzhalter je Bereich steht im eigenen <span slot="placeholder">
        # (das placeholder-Attribut wäre unsichtbar) und in der Sprache der Oberfläche;
        # Überschrift über der Adressbuchliste und Today-Pane-Titel ebenso übersetzt
        res = m.js(r'''
          const before = new Set(tm.tabInfo);
          const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const ph = () => bar?.querySelector('[slot="placeholder"]');
          const text = () => ph()?.textContent;
          const out = { locale: Services.locale.appLocaleAsBCP47, attr: null };
          const step = async (key, open, expectChange = true) => {
            const prev = text(); await open();
            out[key] = await until(() => (!expectChange || text() != prev) && text(), 4000) || text();
          };
          await toMail(); await wait(300); out.mail = text();
          out.slotted = !!ph()?.assignedSlot; out.l10n = !!ph()?.hasAttribute("data-l10n-id");
          // zu langer Platzhalter endet mit „…“ im Feld statt darüber hinaus
          const box = bar?.shadowRoot?.querySelector("div")?.getBoundingClientRect();
          out.ellipsis = ph() && [w.getComputedStyle(ph()).textOverflow, Math.round(ph().getBoundingClientRect().width) <= Math.round(box?.width || 0)];
          await step("calendar", () => toCalendar());
          await step("tasks", async () => { tm.openTab("tasks", {}); await wait(1500); });
          await step("addressbook", async () => { tm.openTab("addressBookTab", {}); await wait(1500); });
          // Dokument bei jedem Versuch neu lesen: unter Last ist nach 1,5 s noch das leere Startdokument geladen
          out.books = (await until(() => tm.currentTabInfo.browser?.contentDocument?.getElementById("mcBooksHeader"), 8000))?.textContent;
          await step("settings", async () => { w.openPreferencesTab(); await wait(1500); });
          out.attr = bar?.getAttribute("placeholder");
          out.today = [d.getElementById("mcTodayTitle")?.textContent, d.getElementById("today-pane-header")?.dataset.mcTitle];
          for (const t of [...tm.tabInfo]) { if (!before.has(t)) tm.closeTab(t); }
          await toMail(); await wait(300); out.back = text();
          return out;''')
        expect = {
            "de": ["durchsuchen", "Kalender durchsuchen", "Aufgaben durchsuchen", "Kontakte durchsuchen",
                   "Einstellungen durchsuchen", "Adressbücher", "Heute-Leiste"],
            "en": ["Search ", "Search Calendar", "Search Tasks", "Search Contacts", "Search Settings",
                   "Address Books", "Today Pane"],
        }.get(res["locale"].split("-")[0])
        got = [res["mail"], res["calendar"], res["tasks"], res["addressbook"], res["settings"], res["books"]]
        ok = (res["slotted"] and not res["l10n"] and not res["attr"] and res["back"] == res["mail"]
              and res["ellipsis"] == ["ellipsis", True])
        if expect:
            # Mail: je nach Ordner „Search Inbox“ bzw. „Search All Mailboxes“ (eigene Prüfung)
            ok = (ok and expect[0] in (got[0] or "") and got[1:] == expect[1:6]
                  and all(t in (None, expect[6]) for t in res["today"]) and expect[6] in res["today"])
        else:  # andere Sprache: Thunderbirds eigener Platzhalter, nur Überschrift prüfen
            ok = bool(res["books"])
        return ok, f"{res}"
    check("Suche: Platzhalter je Bereich sichtbar und übersetzt (Search Calendar, Tasks, Contacts, Settings), Überschrift „Adressbücher“, Today-Pane-Titel", search_placeholder, results)

    def search_scope():
        # Suche wie Apple Mail: im gewählten Ordner nur dort, in Sammelordnern global; nie Mails ohne den Begriff;
        # Platzhalter „Search <Ordner>“ bzw. „Search All Mailboxes“; Ordnerwechsel während der Suche sucht dort weiter
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const folder = name => { if (!root.containsChildNamed(name)) root.createSubfolder(name, null); return root.getChildNamed(name); };
          const A = folder("SucheA"), B = folder("SucheB"); await wait(800);
          const mail = (subject, id, o = {}) => unescape(encodeURIComponent([`From: ${o.from || "Anna Beispiel <anna@example.invalid>"}`,
            `To: ${o.to || "Halo Test <halo@example.invalid>"}`, `Subject: ${subject}`, "Date: Mon, 19 Oct 2026 10:00:00 +0200", `Message-ID: <${id}@example.invalid>`,
            ...(o.refs ? [`In-Reply-To: <${o.refs}@example.invalid>`, `References: <${o.refs}@example.invalid>`] : []), "MIME-Version: 1.0", `Content-Type: ${o.type || "text/plain; charset=UTF-8"}`, "", o.body || "Nichts Besonderes.", ""].join("\r\n")));
          if (!A.getTotalMessages(false)) {
            const la = A.QueryInterface(Ci.nsIMsgLocalMailFolder);
            la.addMessage(mail("Halo Zebrafink im Betreff", "suche-a1"));
            la.addMessage(mail("Halo ohne Begriff", "suche-a2"));
            la.addMessage(mail("Halo Link", "suche-a3", { type: "text/html; charset=UTF-8", body: '<p>Siehe <a href="https://zebrafink.example.invalid/">hier</a>.</p>' }));
            la.addMessage(mail("Halo Adresse", "suche-a4", { to: "Kundendienst <service@zebrafink.example.invalid>" }));
            B.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Halo Zebrafink anderswo", "suche-b1"));
            // Antwort im selben Faden ohne den Begriff – darf in der Trefferliste nicht erscheinen
            B.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("Re: Halo Termin", "suche-b2", { body: "Passt mir.", refs: "suche-b1" }));
            await wait(1000);
          }
          const a3 = await toMail(); const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const ph = () => bar?.querySelector('[slot="placeholder"]')?.textContent;
          const search = async text => { bar.dispatchEvent(new w.CustomEvent("search", { detail: text, bubbles: true, composed: true })); await wait(2000); };
          const hits = () => { try { a3.gDBView?.doCommand(Ci.nsMsgViewCommandType.expandAll); } catch {}
            return [...Array(a3.gDBView?.rowCount || 0).keys()].map(i => a3.gDBView.getMsgHdrAt(i)?.messageId?.split("@")[0]).filter(Boolean).sort(); };
          const out = {};
          a3.displayFolder(A.URI); await wait(900); out.phA = ph();
          await search("zebrafink"); out.inA = hits();
          // gemerkte Treffer einer früheren Suche (die Mail ohne Begriff) – müssen bei der nächsten Suche verschwinden
          const sf = a3.gFolder, a2 = [...A.messages].find(h => h.messageId == "suche-a2@example.invalid");
          out.cacheApi = typeof A.msgDatabase.refreshCache == "function";
          if (out.cacheApi && a2) { A.msgDatabase.refreshCache(sf.URI, [a2.messageKey]); }
          await search("zebrafin"); out.afterStale = hits(); out.staleLeft = [...A.msgDatabase.getCachedHits(sf.URI)].map(h => h.messageId.split("@")[0]); out.header = d.getElementById("mcListHeader")?.querySelector(".mc-lh-count")?.textContent;
          // Ordnerwechsel während der Suche: sucht im neuen Ordner weiter
          a3.displayFolder(B.URI); await wait(2500); out.inB = hits(); out.phB = ph();
          await search(""); await wait(600);
          // Sammelordner „Alle Eingänge“ (smart mailboxes): global
          // „Alle Eingänge“ legt Thunderbird erst mit der Ansicht „Unified Folders“ an – dafür einschalten
          const { SmartMailboxUtils } = ChromeUtils.importESModule("resource:///modules/SmartMailboxUtils.sys.mjs");
          const smart = [...MailServices.accounts.allFolders].find(f => /smart%20mailboxes/i.test(f.URI) && f.getFlag(Ci.nsMsgFolderFlags.Inbox))
            || SmartMailboxUtils.getSmartMailbox().rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
          if (smart) {
            // Ordnerliste muss „Alle Eingänge“ zeigen (Ansicht „Unified Folders“), sonst wählt displayFolder nichts aus
            if (!a3.folderPane.getRowForFolder(smart.URI) && !a3.folderPane.activeModes.includes("smart")) {
              a3.folderPane.activeModes = [...a3.folderPane.activeModes, "smart"]; await wait(800); }
            for (let i = 0; i < 10 && a3.gFolder?.URI != smart.URI; i++) { a3.displayFolder(smart.URI); await wait(300); }
            await wait(600); out.phSmart = ph();
            // Sammelordner zeigen Fäden gruppiert (wie oft im Alltag) – die Treffer trotzdem nur einzeln
            a3.gViewWrapper.showThreaded = true; await wait(400);
            await search("zebrafink"); out.inSmart = hits(); out.threaded = a3.gViewWrapper?.showThreaded; await search("");
            // schnelles Tippen: jeder Buchstabe startet eine Suche, die vorige läuft über alle Postfächer evtl. noch
            for (const part of ["h", "ha", "hal", "halo", "halo z", "halo ze", "zebrafink"]) {
              bar.dispatchEvent(new w.CustomEvent("search", { detail: part, bubbles: true, composed: true })); await wait(40); }
            await wait(2500); out.typedSmart = hits(); await search(""); }
          await wait(600);
          return out;""")
        a = res.get("inA") or []
        # Treffer über die Empfängeradresse (a4) sind gewollt – Apple Mail sucht auch in Adressen; nur im HTML-Link (a3) nicht
        ok = ("suche-a1" in a and "suche-a2" not in a and "suche-a3" not in a and "suche-b1" not in a
              and res.get("cacheApi") and "suche-a2" not in (res.get("afterStale") or []) and "suche-a2" not in (res.get("staleLeft") or [])
              and res.get("phA") == "Search SucheA" and res.get("phB") == "Search SucheB"
              and res.get("inB") == ["suche-b1"] and (res.get("header") or "").startswith("SucheA")
              and (res.get("phSmart") is None or (res["phSmart"] == "Search All Mailboxes" and {"suche-a1", "suche-b1"} <= set(res.get("inSmart") or [])
                                                  and not {"suche-a2", "suche-a3", "suche-b2"} & set(res.get("inSmart") or [])
                                                  and set(res.get("typedSmart") or []) == set(res.get("inSmart") or []))))
        return ok, f"{res}"
    check("Suche: im gewählten Ordner nur dort, in Sammelordnern global, keine Mails ohne den Begriff, Platzhalter je Ordner, Ordnerwechsel sucht weiter", search_scope, results)

    def search_stages():
        # zweistufige Suche: erst Betreff/Absender/Empfänger (Treffer sofort), danach der Text – die Treffer der
        # ersten Stufe bleiben stehen, Texttreffer kommen dazu, keine Zeile doppelt; Ordnerwechsel startet neu
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const folder = name => { if (!root.containsChildNamed(name)) root.createSubfolder(name, null); return root.getChildNamed(name); };
          const A = folder("StufeA"), B = folder("StufeB"); await wait(800);
          const mail = (id, subject, body, from = "Anna Beispiel <anna@example.invalid>") => [`From: ${from}`, "To: Halo Test <halo@example.invalid>",
            `Subject: ${subject}`, "Date: Mon, 19 Oct 2026 10:00:00 +0200", `Message-ID: <${id}@example.invalid>`, "Content-Type: text/plain; charset=UTF-8", "", body, ""].join("\r\n");
          if (!A.getTotalMessages(false)) {
            const la = A.QueryInterface(Ci.nsIMsgLocalMailFolder), lb = B.QueryInterface(Ci.nsIMsgLocalMailFolder);
            la.addMessage(mail("stufe-1", "Qy im Betreff", "Nichts Besonderes."));
            la.addMessage(mail("stufe-2", "Angebot", "Nichts Besonderes.", "Shop <shop@qy.example.invalid>"));
            la.addMessage(mail("stufe-3", "Nur im Text", "Heute kam ein Qy vorbei."));
            la.addMessage(mail("stufe-4", "Ganz anderes", "Nichts zu sehen."));
            la.addMessage(mail("stufe-5", "Qy doppelt", "Auch im Text: Qy."));
            lb.addMessage(mail("stufe-6", "Anderswo", "Wieder ein Qy."));
            lb.addMessage(mail("stufe-7", "Qy anderswo", "Nichts."));
            await wait(1000);
          }
          const a3 = await toMail(); const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const html = a3.document.documentElement;
          const ids = () => { try { a3.gDBView?.doCommand(Ci.nsMsgViewCommandType.expandAll); } catch {}
            return [...Array(a3.gDBView?.rowCount || 0).keys()].map(i => a3.gDBView.getMsgHdrAt(i)?.messageId?.split("@")[0]).filter(Boolean).sort(); };
          // Stufen mitschreiben; Trefferliste am Ende jeder Stufe (kleine Ordner: die Suche ist schon im ersten Takt fertig)
          const stages = [], ends = []; const obs = new a3.MutationObserver(() => stages.push(html.getAttribute("mc-search-stage")));
          obs.observe(html, { attributes: true, attributeFilter: ["mc-search-stage"] });
          const onEnd = () => ends.push([html.getAttribute("mc-search-stage"), ids()]); a3.addEventListener("allMessagesLoaded", onEnd);
          const done = () => until(() => !html.hasAttribute("mc-search-stage") && !a3.gViewWrapper?.searching, 10000);
          const out = {};
          // Suche ohne Index (mit Index siehe search_gloda): Begriff mit zwei Zeichen – halo.spaces fragt Gloda erst ab
          // drei Zeichen. Gloda abschalten geht hier nicht: dann entfernt Thunderbird das Suchfeld aus der Symbolleiste
          // (je nach Takt vor dem Suchen) und das Ereignis ginge an ein abgehängtes Feld, das Thunderbirds eigene Suche öffnet
          a3.displayFolder(A.URI); await wait(900);
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "qy", bubbles: true, composed: true }));
          out.done = !!(await done()); await wait(300);
          out.stages = stages.splice(0); out.headersEnd = ends.filter(e => e[0] == "headers").pop()?.[1]; out.inA = ids(); out.rows = a3.gDBView?.rowCount;
          out.saved = (() => { try { return a3.gFolder.msgDatabase.dBFolderInfo.getCharProperty("searchStr"); } catch { return ""; } })();
          // Ordnerwechsel während der Suche: dort wieder erst Kopfzeilen, dann Text (je nach Takt startet der Wechsel
          // die Suche zweimal – es zählt der letzte Durchgang)
          a3.displayFolder(B.URI); await wait(400); out.doneB = !!(await done()); await wait(300);
          out.stagesB = stages.splice(0); out.inB = ids();
          obs.disconnect(); a3.removeEventListener("allMessagesLoaded", onEnd);
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "", bubbles: true, composed: true })); await wait(1200);
          out.attrAfter = html.getAttribute("mc-search-stage");
          return out;""")
        ok = (res.get("done") and res.get("stages") == ["headers", "body", None]
              and res.get("headersEnd") == ["stufe-1", "stufe-2", "stufe-5"]
              and res.get("inA") == ["stufe-1", "stufe-2", "stufe-3", "stufe-5"] and res.get("rows") == 4
              and "body" in (res.get("saved") or "").lower()
              and res.get("doneB") and (res.get("stagesB") or [])[-3:] == ["headers", "body", None] and res.get("inB") == ["stufe-6", "stufe-7"]
              and res.get("attrAfter") is None)
        return ok, f"{res}"
    check("Suche: zuerst Kopfzeilen, Text danach – Treffer bleiben stehen, keine doppelten, Ordnerwechsel startet neu", search_stages, results)

    def search_gloda():
        # Suche mit Thunderbirds Index (Gloda) wie Apple Mail: indizierte Treffer – auch nur im Text – stehen als gemerkte
        # Treffer sofort da, die Ordnersuche läuft gleich mit dem Text und ergänzt, was Gloda nicht kennt; keine Zeile
        # doppelt, nur Treffer im gewählten Ordner. Indiziert Gloda nicht rechtzeitig: übersprungen (Rückfall: search_stages)
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { GlodaMsgIndexer } = ChromeUtils.importESModule("resource:///modules/gloda/IndexMsg.sys.mjs");
          const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
          const { GlodaConstants } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaConstants.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const folder = name => { if (!root.containsChildNamed(name)) root.createSubfolder(name, null); return root.getChildNamed(name); };
          const A = folder("IndexA"), B = folder("IndexB"); await wait(800);
          const mail = (id, subject, body) => ["From: Anna Beispiel <anna@example.invalid>", "To: Halo Test <halo@example.invalid>",
            `Subject: ${subject}`, "Date: Tue, 20 Oct 2026 10:00:00 +0200", `Message-ID: <${id}@example.invalid>`, "Content-Type: text/plain; charset=UTF-8", "", body, ""].join("\r\n");
          const la = A.QueryInterface(Ci.nsIMsgLocalMailFolder);
          if (!A.getTotalMessages(false)) {
            la.addMessage(mail("index-1", "Pelikan im Betreff", "Nichts Besonderes."));
            la.addMessage(mail("index-2", "Nur im Text", "Heute stand ein Pelikan am Ufer."));
            la.addMessage(mail("index-3", "Ganz anderes", "Nichts zu sehen."));
            B.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(mail("index-4", "Anderswo", "Wieder ein Pelikan."));
            await wait(1000);
          }
          const out = {};
          GlodaMsgIndexer.indexMessages([...A.messages, ...B.messages].map(h => [h.folder, h.messageKey]));
          const known = () => new Promise(r => { const q = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE); q.fulltextMatches('"pelikan*"');
            q.getCollection({ onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {}, onQueryCompleted: c => r(c.items.length) }); });
          for (let i = 0; i < 60 && (out.indexed = await known()) < 3; i++) await wait(500);
          if (out.indexed < 3) return out;
          // ganz neue Mail, die Gloda evtl. noch nicht kennt – die Ordnersuche ergänzt sie
          if (![...A.messages].some(h => h.messageId.startsWith("index-5"))) { la.addMessage(mail("index-5", "Pelikan ganz neu", "Neu.")); await wait(600); }
          const a3 = await toMail(); const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const html = a3.document.documentElement;
          const ids = () => { try { a3.gDBView?.doCommand(Ci.nsMsgViewCommandType.expandAll); } catch {}
            return [...Array(a3.gDBView?.rowCount || 0).keys()].map(i => a3.gDBView.getMsgHdrAt(i)?.messageId?.split("@")[0]).filter(Boolean).sort(); };
          const stages = [];
          const obs = new a3.MutationObserver(() => { const st = html.getAttribute("mc-search-stage"); stages.push(st);
            // beim Start der Ordnersuche: gemerkte Treffer aus Gloda (auch der Texttreffer)
            if (st == "body" && !out.seeded) { out.gloda = html.getAttribute("mc-search-gloda");
              // gleich beim Start, solange die Ordnersuche noch läuft: die Gloda-Treffer stehen schon in der Liste
              try { out.early = { searching: !!a3.gViewWrapper?.searching,
                ids: [...Array(a3.gDBView?.rowCount || 0).keys()].map(i => a3.gDBView.getMsgHdrAt(i)?.messageId?.split("@")[0]).filter(Boolean).sort() }; } catch (e) { out.early = String(e); }
              try { out.seeded = [...A.msgDatabase.getCachedHits(MailServices.accounts.localFoldersServer.rootFolder.subFolders.find(f => f.name == "halo.spaces search").URI)]
                .map(h => h.messageId.split("@")[0]).sort(); } catch (e) { out.seeded = String(e); } } });
          obs.observe(html, { attributes: true, attributeFilter: ["mc-search-stage"] });
          a3.displayFolder(A.URI); await wait(900);
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "pelikan", bubbles: true, composed: true }));
          out.done = !!(await until(() => !html.hasAttribute("mc-search-stage") && !a3.gViewWrapper?.searching, 10000)); await wait(300);
          obs.disconnect();
          out.stages = stages; out.ids = ids(); out.rows = a3.gDBView?.rowCount;
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "", bubbles: true, composed: true })); await wait(1200);
          out.glodaAfter = html.getAttribute("mc-search-gloda");
          return out;""")
        if (res.get("indexed") or 0) < 3:
            # nicht still als OK: bricht der Gloda-Weg ganz weg, soll das im Lauf auffallen
            print(f"WARNUNG Suche mit Gloda: Testmails nicht rechtzeitig indiziert – Prüfung übersprungen {res}", flush=True)
            return True, f"WARNUNG: Gloda hat die Testmails nicht rechtzeitig indiziert – übersprungen {res}"
        seeded = res.get("seeded") or []
        early = res.get("early") if isinstance(res.get("early"), dict) else {}
        ok = (res.get("done") and res.get("stages") == ["index", "body", None]
              and isinstance(seeded, list) and "index-1" in seeded and "index-2" in seeded and "index-4" not in seeded
              and int(res.get("gloda") or 0) >= 2 and early.get("searching") and {"index-1", "index-2"} <= set(early.get("ids") or [])
              and res.get("ids") == ["index-1", "index-2", "index-5"] and res.get("rows") == 3 and res.get("glodaAfter") is None)
        return ok, f"{res}"
    check("Suche: Treffer aus Thunderbirds Index sofort, auch nur im Text; Ordnersuche ergänzt neue Mails, keine doppelten, nur im gewählten Ordner", search_gloda, results)

    def search_scroll():
        # laufende Suche über viele Postfächer: beim Scrollen hält halo.spaces sie an (sonst kam jedes zweite Bild
        # 50–70 ms zu spät), danach läuft sie weiter und findet alle Treffer
        NF, NM = 24, 400
        for start in range(0, NF, 4):
            m.js(r"""
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
              const root = MailServices.accounts.localFoldersServer.rootFolder;
              const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(150);
              for (let f = %d; f < %d; f++) {
                if (!root.containsChildNamed("Viel" + f)) { root.createSubfolder("Viel" + f, null); await wait(300); }
                const folder = root.getChildNamed("Viel" + f); if (folder.getTotalMessages(false) >= %d) continue;
                const msgs = [];
                for (let i = 0; i < %d; i++) { const k = f * %d + i;
                  msgs.push(`From - Sat Oct 17 10:00:00 2026\r\nFrom: Shop <shop${k %% 30}@example.invalid>\r\nSubject: ${i %% 2 ? "Bestellung Quokka " + k : "Betreff " + k}\r\nDate: ${1 + k %% 28} Sep 2026 ${String(k %% 24).padStart(2, "0")}:${String(k %% 60).padStart(2, "0")}:00 +0200\r\nMessage-ID: <viel-${k}@example.invalid>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${filler}\r\n`); }
                folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessageBatch(msgs); await wait(200);
              }
              return 1;""" % (start, min(start + 4, NF), NM, NM, NM))
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          await wait(1500);
          Services.prefs.setIntPref("mail.threadpane.listview", 0);
          w.resizeTo(1500, 950); await wait(400);
          const a3 = await toMail(); const tree = a3.threadTree; a3.displayFolder(root.URI); await wait(800);
          const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          const frame = () => new Promise(r => a3.requestAnimationFrame(r));
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "quokka", bubbles: true, composed: true }));
          await until(() => a3.gViewWrapper?.searching && a3.gDBView?.rowCount > 0, 8000);
          const out = { visibility: d.visibilityState, startRows: a3.gDBView?.rowCount, searching: !!a3.gViewWrapper?.searching };
          // 1,5 s mit dem Mausrad scrollen: Trefferzahl steht still, Bilder im normalen Takt (Thunderbird meldet
          // der Liste die Treffer erst am Ende der Suche – bis dahin bewegt sie sich nur im bekannten Bereich, das
          // Mausrad kommt aber immer an)
          const sc = tree.scrollable || tree;
          const wheel = () => { sc.dispatchEvent(new a3.WheelEvent("wheel", { deltaY: 30, deltaMode: 0, bubbles: true, cancelable: true })); sc.scrollTop += 30; };
          wheel(); await frame(); await frame();
          const dts = []; let prev = performance.now(); const t0 = prev; const r0 = a3.gDBView.rowCount;
          while (performance.now() - t0 < 1500) { wheel(); await frame(); const now = performance.now(); dts.push(now - prev); prev = now; }
          dts.sort((x, y) => x - y);
          out.duringScroll = [r0, a3.gDBView.rowCount]; out.frameMedian = Math.round(dts[dts.length >> 1]); out.slow = dts.filter(x => x > 40).length; out.frames = dts.length;
          // losgelassen: die Suche läuft weiter bis zum Ende
          // (zweistufig: erst wenn auch der Text durchsucht ist)
          const html = a3.document.documentElement;
          await until(() => !a3.gViewWrapper?.searching && !html.hasAttribute("mc-search-stage"), 40000); await wait(500);
          out.end = a3.gDBView.rowCount; out.done = !a3.gViewWrapper?.searching;
          out.rowH = Math.round(tree.querySelector('tr[is="thread-card"]')?.getBoundingClientRect().height || 0);
          // grobe Messung ohne Scrollen: Dauer der Kopfzeilen- und der Text-Stufe, Treffer nach Stufe eins
          const marks = []; const t0s = performance.now();
          const obs = new a3.MutationObserver(() => marks.push([html.getAttribute("mc-search-stage"), Math.round(performance.now() - t0s), a3.gDBView?.rowCount]));
          obs.observe(html, { attributes: true, attributeFilter: ["mc-search-stage"] });
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "bestellung", bubbles: true, composed: true }));
          await until(() => !a3.gViewWrapper?.searching && !html.hasAttribute("mc-search-stage"), 40000); obs.disconnect();
          out.timing = marks;
          // Scrollposition: in der Textstufe (die Liste kennt die Kopfzeilentreffer) wegscrollen – nach dem Ende
          // der Suche steht die Liste noch dort, statt nach oben zu springen
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "betreff", bubbles: true, composed: true }));
          await until(() => html.getAttribute("mc-search-stage") == "body" && tree.querySelector('tr[is="thread-card"]'), 10000);
          // (Thunderbird meldet der Liste die Treffer erst am Ende – weit scrollen lässt sie sich währenddessen nicht)
          for (let i = 0; i < 20; i++) { wheel(); await frame(); }
          out.scroll = { stage: html.getAttribute("mc-search-stage"), after: Math.round(sc.scrollTop) };
          await until(() => !a3.gViewWrapper?.searching && !html.hasAttribute("mc-search-stage"), 40000); await wait(500);
          out.scroll.end = Math.round(sc.scrollTop);
          return out;""")
        # aufräumen: Suche beenden, die großen Ordner wieder löschen (sonst bremsen sie spätere Prüfungen)
        m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          const bar = d.querySelector("#unifiedToolbarContent global-search-bar");
          bar.dispatchEvent(new w.CustomEvent("search", { detail: "", bubbles: true, composed: true })); await wait(1200);
          const a3 = await toMail(); const inbox = root.getChildNamed("Inbox"); if (inbox) { a3.displayFolder(inbox.URI); await wait(600); }
          for (const f of [...root.subFolders].filter(f => /^Viel\d+$/.test(f.name))) { try { root.propagateDelete(f, true); } catch {} }
          await wait(1000); return 1;""")
        if not res.get("searching"):
            return True, f"Suche schon vor dem Scrollen fertig – übersprungen {res}"
        if res.get("visibility") == "hidden":
            return True, f"Testfenster verdeckt – übersprungen {res}"
        # (Treffer mindestens die Hälfte: bei so erzeugten lokalen Mails liest die Textsuche teils in die nächste Mail hinein)
        # Windows-VM: Thunderbird läuft dort emuliert (x64 auf ARM) – langsame Einzelbilder bis zur Hälfte, der Median zählt
        slow_max = res["frames"] // 2 if sys.platform == "win32" else res["frames"] // 10
        ok = (res["duringScroll"][0] == res["duringScroll"][1] and res["done"] and res["end"] >= NF * NM // 2
              and res["frameMedian"] <= 25 and res["slow"] <= slow_max
              and abs(res["scroll"]["end"] - res["scroll"]["after"]) <= max(res["rowH"], 40))
        return ok, f"{res}"
    check("Suche: Scrollen während einer laufenden Suche flüssig (Suche wartet), danach alle Treffer, Scrollposition bleibt", search_scroll, results)

    def settings_style():
        # Einstellungen: Inhalt linksbündig 28 px neben der Seitenleiste (max. 800 px), Kästchen/Optionsfelder im macOS-Stil,
        # Zahlenfeld ohne Systempfeile, Ansichtskacheln ohne Optionsfeld, Kontoeinstellungen als Karten
        res = m.js(r'''
          w.resizeTo(1500, 950); w.openPreferencesTab("paneAppearance"); await wait(2500);
          const cw = tm.currentTabInfo.browser.contentWindow; const cd = cw.document; const cs = e => cw.getComputedStyle(e);
          const deck = cd.querySelector(".paneDeckContainer").getBoundingClientRect();
          const box = cd.getElementById("preferencesContainer").getBoundingClientRect();
          const checked = [...cd.querySelectorAll("#paneDeck checkbox[checked]")].find(c => c.getBoundingClientRect().width)?.querySelector(".checkbox-check");
          const radio = cd.querySelector("#paneDeck radio:not(.appearance-options radio) .radio-check");
          const tileCheck = cd.querySelector("#appearanceStyleCards .radio-check");
          // verschachtelte Unterüberschriften („Card view options“, „Display width“) wie der Kartentitel 13 px
          const legends = [...new Set([...cd.querySelectorAll("#paneDeck legend")].map(l => cs(l).fontSize))];
          cw.gotoPref("paneChat"); await wait(1200);
          const num = cd.querySelector("#paneDeck input[type=number]");
          const out = { width: Math.round(deck.width), offset: Math.round(deck.left - box.left),
            checkbox: checked ? [cs(checked).appearance, cs(checked).borderTopLeftRadius] : null,
            radio: radio ? [cs(radio).appearance, cs(radio).borderTopLeftRadius] : null,
            tileCheck: tileCheck ? cs(tileCheck).display : null, number: num ? cs(num).appearance : null, legends };
          // Zahlenfeld ohne macOS-Feldrahmen: dieselbe Haarlinie und Fläche wie die Textfelder
          const txt = [...cd.querySelectorAll("#paneDeck input[type=text]")][0];
          out.numberLook = num && txt ? [cs(num).borderTopColor == cs(txt).borderTopColor,
            cs(num).backgroundColor == cs(cd.getElementById("preferencesContainer")).backgroundColor] : null;
          tm.closeTab(tm.currentTabInfo);
          w.MsgAccountManager(null);
          // je nach Konto die Liste (Ausgangsserver) oder ein Eingabefeld (Kontoseite)
          const el = await until(() => tm.currentTabInfo.browser?.contentDocument?.getElementById("contentFrame")?.contentDocument
            ?.querySelector("#containerBox richlistbox, #containerBox input:is([type=text], :not([type]))"), 8000);
          out.accountList = el ? [el.localName, el.ownerDocument.defaultView.getComputedStyle(el).borderTopLeftRadius] : null;
          tm.closeTab(tm.currentTabInfo);
          return out;''')
        ok = (res["width"] <= 800 and res["offset"] == 28 and res["checkbox"] == ["none", "4px"] and res["legends"] == ["13px"]
              and res["radio"] and res["radio"][0] == "none" and res["tileCheck"] == "none" and res["number"] == "none" and res["numberLook"] == [True, True]
              and res["accountList"] in (["richlistbox", "12px"], ["input", "7px"]))
        return ok, f"{res}"
    check("Einstellungen: Inhalt linksbündig neben der Seitenleiste, Kästchen und Optionsfelder wie macOS, Kacheln, Kontoeinstellungen", settings_style, results)

    def settings_cards():
        # Einstellungen: Grundschrift 13 px, Seitenleiste bündig, Listen mit Haarlinie, sicheres DNS als Karte,
        # Export für Mobilgeräte ohne Marineblau, leere Abstandhalter weg, Unterdialoge (Offline, Bäume)
        res = m.js(r'''
          w.resizeTo(1500, 950); w.openPreferencesTab("paneGeneral"); await wait(2500);
          const cw = tm.currentTabInfo.browser.contentWindow; const cd = cw.document;
          const cs = e => e.ownerDocument.defaultView.getComputedStyle(e);
          const vis = sel => [...cd.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width);
          const win = cs(cd.getElementById("preferencesContainer")).backgroundColor;
          const line = cs(cd.querySelector("#paneDeck input[type=text]")).borderTopColor;
          const left = el => { const r = cd.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().left; };
          const out = {};
          const lab = vis("#paneDeck checkbox .checkbox-label"); const desc = vis("#paneDeck description");
          const fontLab = cd.getElementById("defaultFont")?.parentNode.querySelector("label");
          out.font = [lab && cs(lab).fontSize, fontLab && cs(fontLab).fontSize, desc && cs(desc).fontSize];
          // die Kategorie „Account Settings“ hängt halo.spaces kurz nach dem Öffnen ein (unter Linux/Last später)
          await until(() => cd.querySelector("#mcCat-paneMcAccounts .category-name")?.getBoundingClientRect().width, 6000);
          const cn = cd.querySelector("#category-general .category-name"), fl = cd.querySelector("#mcCat-paneMcAccounts .category-name") || cd.querySelector("#accountButton .sidebar-footer-label");
          out.side = [Math.abs(left(cn) - left(fl)) <= 1, cs(cn).fontSize, cs(fl).fontSize, Math.round(left(cn) - left(fl))];
          out.lists = ["tagList", "handlersView"].map(id => { const e = cd.getElementById(id);
            return [cs(e).borderTopLeftRadius, parseFloat(cs(e).borderTopWidth) <= 1, cs(e).borderTopColor == line]; });
          out.handlers = [cs(cd.querySelector("#handlersTable thead > tr")).backgroundColor == win, cs(cd.getElementById("handlersView")).overflowY];
          // Offline-Einstellungen: Optionen untereinander, jede einzeilig
          const ob = cd.getElementById("offlineSettingsButton"); ob.scrollIntoView({ block: "center" }); ob.click();
          let fr = await until(() => [...cd.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.location.href.includes("offline")), 8000);
          if (fr) { await wait(800); const dd = fr.contentDocument;
            const rs = [...dd.querySelectorAll("#whengoingOnlinestate radio")].map(r => r.getBoundingClientRect());
            // einzeilig: höchstens 30 px (umbrochen wären es über 40; unter Linux mit GTK-Optionsfeld 26)
            out.offline = [rs.length > 1 && rs.every((r, i) => !i || (r.top >= rs[i - 1].bottom - 1 && Math.abs(r.left - rs[0].left) < 1)),
              Math.max(...[...dd.querySelectorAll("#whengoingOnlinestate radio, #whengoingOfflinestate radio")].map(r => r.getBoundingClientRect().height))];
            cw.gSubDialog._topDialog?.close(); await wait(600); }
          cw.gotoPref("panePrivacy"); await wait(1500);
          const arrow = cd.getElementById("dohDefaultArrow"); const icon = arrow?.querySelector(".button-icon");
          // -moz-context-properties steht nicht im berechneten Stil – stroke ist ohne die Regel „none“
          out.doh = arrow ? [cs(icon).stroke == cs(arrow).color, cs(arrow).backgroundColor,
            Math.round(arrow.getBoundingClientRect().width) <= 28] : null;
          const box = cd.getElementById("dohBox"), opt = cd.getElementById("dohOptionDefault");
          out.dohBox = [cs(box).borderTopLeftRadius, cs(box).backgroundColor != "rgba(0, 0, 0, 0)",
            cs(opt).borderTopLeftRadius, parseFloat(cs(opt).borderTopWidth) <= 1, cs(opt).borderTopColor == line];
          out.pwSep = cs(cd.getElementById("privacyPasswordsCategory").nextElementSibling).display;
          // Sicheres DNS: Statuskasten ohne Netzwerkstatus verborgen, mit Statustext sichtbar (Gegenprobe)
          const dss = cd.getElementById("dohStatusSection"), dst = cd.getElementById("dohStatus");
          const dssH = () => Math.round(dss.getBoundingClientRect().height);
          out.dohStatus = [dst.textContent, cs(dss).display, dssH()];
          const oldStatus = dst.textContent; dst.textContent = "Status: Off"; await wait(200);
          out.dohStatus.push(dssH()); dst.textContent = oldStatus; await wait(100);
          // Unterüberschriften (auch verschachtelte legend) nicht größer als der Kartentitel
          out.legendsPrivacy = [...new Set([...cd.querySelectorAll("#paneDeck legend")].map(l => cs(l).fontSize))];
          // OCSP einzeilig (eine Zeile ca. 23 px, zwei ca. 46 px), Knöpfe weiterhin rechts in der Karte
          const ocsp = cd.querySelector("#enableOCSP .checkbox-label"), ocspCard = cd.getElementById("enableOCSP").closest("fieldset");
          out.ocsp = [Math.round(ocsp.getBoundingClientRect().height),
            ["manageCertificatesButton", "viewSecurityDevicesButton"].map(id => { const r = cd.getElementById(id).getBoundingClientRect();
              return r.width > 0 && r.right <= ocspCard.getBoundingClientRect().right && r.left > ocsp.getBoundingClientRect().right; })];
          // Cookie-Ausnahmen: Baum mit Haarlinie und 8 px
          const cb = cd.getElementById("cookieExceptions"); cb.scrollIntoView({ block: "center" }); cb.click();
          fr = await until(() => [...cd.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.querySelector("tree")), 8000);
          if (fr) { await wait(800); const dd = fr.contentDocument; const t = dd.querySelector("tree");
            const probe = dd.createElementNS("http://www.w3.org/1999/xhtml", "div"); probe.style.color = "var(--mt-pane-line)"; dd.documentElement.append(probe);
            out.tree = [cs(t).borderTopLeftRadius, parseFloat(cs(t).borderTopWidth) <= 1, cs(t).borderTopColor == cs(probe).color];
            probe.remove(); cw.gSubDialog._topDialog?.close(); await wait(600); }
          cw.gotoPref("paneCalendar"); await wait(1500);
          const fs = vis("#paneDeck fieldset"); const dp = cd.getElementById("datePrefsBox");
          out.cal = [fs.firstElementChild.localName, cs(fs.firstElementChild).display, Math.round(dp.getBoundingClientRect().top - dp.closest("fieldset").getBoundingClientRect().top)];
          cw.gotoPref("paneQrExport"); await wait(1500);
          const qr = cd.getElementById("qrExportIntroForm"); const rgb = cs(qr).backgroundColor.match(/[\d.]+/g).map(Number);
          out.qr = [cs(qr).borderTopStyle, cs(qr).borderTopLeftRadius, Math.abs(rgb[0] - rgb[2]) <= 3,
            cs(cd.querySelector(".qr-small")).fontSize, cs(cd.getElementById("qrExportSelectAll")).textTransform];
          tm.closeTab(tm.currentTabInfo);
          return out;''')
        # bündige Seitenleiste nur unter macOS genau prüfen (Linux: andere Symbol-/Schriftmaße, Abweichung steht im Ergebnis)
        side_ok = res["side"][1:3] == ["13px", "13px"] and (res["side"][0] or sys.platform != "darwin")
        ok = (res["font"] == ["13px", "13px", "12px"] and side_ok
              and res["lists"] == [["8px", True, True]] * 2 and res["handlers"] == [True, "auto"]
              and res.get("offline") and res["offline"][0] is True and res["offline"][1] <= 30
              and res["doh"] and res["doh"][0] and res["doh"][1] == "rgba(0, 0, 0, 0)" and res["doh"][2]
              and res["dohBox"] == ["12px", True, "10px", True, True] and res["pwSep"] == "none"
              and res["dohStatus"][1:3] == ["none", 0] and res["dohStatus"][3] > 0
              and res["legendsPrivacy"] == ["13px"] and res["ocsp"][0] <= 30 and res["ocsp"][1] == [True, True]
              and res.get("tree") == ["8px", True, True]
              and res["cal"][:2] == ["separator", "none"] and res["cal"][2] <= 20
              and res["qr"] == ["none", "12px", True, "11px", "none"])
        return ok, f"{res}"
    check("Einstellungen: Schrift 13 px, Seitenleiste bündig, Listen/DNS/Export als ruhige Karten, leerer DNS-Status verborgen, Unterüberschriften 13 px, OCSP einzeilig, Offline-Dialog untereinander", settings_cards, results)

    def settings_e2ee_cards():
        # Einstellungen: Karte nur mit „Advanced settings“ ohne Fläche (andere Karten behalten sie);
        # Ende-zu-Ende-Texte (html:p) wie Erklärtexte 12 px grau ohne Abstand oben, Linie als Haarlinie,
        # Link „Account settings“ behält seine Linkfarbe
        res = m.js(r"""
          w.resizeTo(1500, 950); w.openPreferencesTab("paneGeneral"); await wait(2500);
          const cw = tm.currentTabInfo.browser.contentWindow; const cd = cw.document;
          const cs = e => e.ownerDocument.defaultView.getComputedStyle(e);
          const out = {};
          const adv = cd.getElementById("configEditor").closest("fieldset");
          const other = [...cd.querySelectorAll("#paneDeck fieldset")].find(f => f != adv && f.querySelector(":scope > legend") && f.getBoundingClientRect().width);
          out.adv = [cs(adv).backgroundColor, cs(adv).paddingTop, cs(adv).marginBottom,
            other ? cs(other).backgroundColor != "rgba(0, 0, 0, 0)" : null];
          cw.gotoPref("panePrivacy"); await wait(1500);
          const p = cd.querySelector("#emailE2eeKeyServers > p"), hr = cd.querySelector("#emailE2eeKeyServers > hr");
          const ref = cd.querySelector("#emailE2eeGroupAutomatism description");
          const first = cd.querySelector("#emailE2eeGroupPreparation > p");
          const probe = cd.createElementNS("http://www.w3.org/1999/xhtml", "div");
          probe.style.borderTop = "1px solid var(--mt-pane-line)"; cd.getElementById("paneDeck").append(probe);
          out.p = p && ref ? [cs(p).fontSize, cs(p).color == cs(ref).color, cs(p).lineHeight] : null;
          out.hr = hr ? [parseFloat(cs(hr).borderTopWidth) <= 1, cs(hr).borderTopColor == cs(probe).borderTopColor,
            cs(hr).borderBottomStyle] : null;
          out.first = first ? [cs(first).marginTop, cs(first).fontSize] : null;
          const a = first?.querySelector("a");
          out.link = a ? cs(a).color != cs(first).color : "kein Link";
          probe.remove();
          tm.closeTab(tm.currentTabInfo);
          return out;""")
        ok = (res["adv"][0] in ("rgba(0, 0, 0, 0)", "transparent") and res["adv"][1] == "0px"
              and res["adv"][2] == "12px" and res["adv"][3] is True
              and res["p"] and res["p"][:2] == ["12px", True]
              and res["hr"] and res["hr"][:2] == [True, True] and res["hr"][2] == "none"
              and res["first"] == ["0px", "12px"] and res["link"] in (True, "kein Link"))
        return ok, f"{res}"
    check("Einstellungen: Karte „Advanced settings“ ohne leere Fläche; Ende-zu-Ende-Texte 12 px grau mit Haarlinie", settings_e2ee_cards, results)

    def settings_details():
        # Einstellungen: Arbeitstage mittig und mit Abstand, Chat-Vorschau mit Abstand/Rahmen und dunkel als
        # Variante „Dark“, Schlagwörter lesbar, „Verzeichnisse bearbeiten“ wie die übrigen Knöpfe (Bearbeiten im
        # Adressbuch bleibt groß), Update-Chronik mit Abstand, Port-Felder ohne Pfeile, schmales Fenster ohne Abschneiden,
        # Schriftgröße kompakt, Kryptographie-Module mit ungekürzten Namen und Abstand zwischen den Listen
        res = m.js(ADDRESS_EDIT_JS.replace('ad.getElementById("editButton").click(); await wait(1200);', '') + r"""
          const abEdit = ad.getElementById("editButton"); const out = { abEdit: [ab.getComputedStyle(abEdit).height, ab.getComputedStyle(abEdit).fontWeight] };
          tm.closeTab(tm.currentTabInfo);
          const dark = w.matchMedia("(prefers-color-scheme: dark)").matches;
          w.resizeTo(1500, 950); w.openPreferencesTab("paneGeneral"); await wait(2500);
          const cw = tm.currentTabInfo.browser.contentWindow; const cd = cw.document;
          const cs = e => e.ownerDocument.defaultView.getComputedStyle(e);
          // color-mix() liefert „color(srgb 0–1 …)“ statt rgb()
          const rgb = c => { const n = c.match(/[\d.]+/g).slice(0, 3).map(Number); return c.startsWith("color(") ? n.map(x => x * 255) : n; };
          const lum = c => { const [r, g, b] = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
          const mid = r => (r.left + r.right) / 2;
          const bg = rgb(cs(cd.getElementById("tagList")).backgroundColor);
          out.tags = [...cd.querySelectorAll("#tagList > richlistitem:not([selected]) > label")].map(l => contrast(rgb(cs(l).color), bg));
          // Schriftgröße neben der Schriftart kompakt statt gleich breit
          const fsz = cd.getElementById("defaultFontSize");
          out.size = [Math.round(fsz.getBoundingClientRect().width), Math.round(cd.getElementById("defaultFont").getBoundingClientRect().width)];
          // Kryptographie-Module: linke Liste breit genug für die Namen, Dialog ohne Überbreite
          cw.gSubDialog.open("chrome://pippki/content/device_manager.xhtml");
          let fd = await until(() => [...cd.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.getElementById("device_tree")), 8000);
          if (fd) { await wait(400); const dd = fd.contentDocument, de = dd.documentElement;
            const dt = dd.getElementById("device_tree"), it = dd.getElementById("info_tree");
            // Namen ungekürzt: Zellentext passt in die Spalte (ohne Ellipse)
            const names = [];
            for (let i = 0; i < dt.view.rowCount; i++) names.push(dt.view.getCellText(i, dt.columns[0]));
            const cv = dd.createElementNS("http://www.w3.org/1999/xhtml", "canvas").getContext("2d"); cv.font = `${cs(dt).fontSize} ${cs(dt).fontFamily}`;
            const colW = dt.columns[0].element.getBoundingClientRect().width;
            out.dev = [Math.round(dt.getBoundingClientRect().width), de.scrollWidth <= de.clientWidth,
              Math.round(it.getBoundingClientRect().left - dt.getBoundingClientRect().right),
              names.length > 0 && names.every((n, i) => cv.measureText(n).width + 16 * (dt.view.getLevel(i) + 1) + 24 <= colW)];
            cw.gSubDialog._topDialog?.close(); await wait(400); }
          // Update-Chronik: Hinweis „No updates installed yet“ nicht am Listenrand
          cw.gSubDialog.open("chrome://mozapps/content/update/history.xhtml");
          let fr = await until(() => [...cd.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.getElementById("historyItems")), 8000);
          if (fr) { await wait(400); const hi = fr.contentDocument.getElementById("historyItems"), lb = hi.querySelector(":scope > label");
            out.history = lb ? [Math.round(lb.getBoundingClientRect().left - hi.getBoundingClientRect().left), Math.round(lb.getBoundingClientRect().top - hi.getBoundingClientRect().top)] : "kein Hinweis";
            cw.gSubDialog._topDialog?.close(); await wait(400); }
          // Verbindungs-Einstellungen: Port-Felder ohne Pfeile, Wert mittig
          cw.gSubDialog.open("chrome://messenger/content/preferences/connection.xhtml");
          fr = await until(() => [...cd.querySelectorAll(".dialogFrame")].find(f => f.contentDocument?.readyState == "complete" && f.contentDocument.getElementById("networkProxyHTTP_Port")), 8000);
          if (fr) { await wait(400); const pt = fr.contentDocument.getElementById("networkProxyHTTP_Port");
            out.port = [cs(pt).appearance, cs(pt).textAlign, cs(pt).borderTopLeftRadius];
            cw.gSubDialog._topDialog?.close(); await wait(400); }
          cw.gotoPref("paneCompose"); await wait(1500);
          const eb = cd.getElementById("editButton"), ar = cd.getElementById("attachment_reminder_button");
          out.edit = [Math.abs(eb.getBoundingClientRect().height - ar.getBoundingClientRect().height) <= 1, cs(eb).fontWeight];
          cw.gotoPref("paneChat"); await wait(1500);
          const pb = cd.getElementById("previewBox"); const pl = pb.parentNode.querySelector(":scope > label");
          out.preview = [Math.round(pb.getBoundingClientRect().left - pl.getBoundingClientRect().right), cs(pb).borderTopLeftRadius, parseFloat(cs(pb).borderTopWidth) <= 1];
          const body = await until(() => cd.querySelector("#previewBox browser")?.contentDocument?.body, 5000);
          out.chat = [Services.prefs.getCharPref("messenger.options.messagesStyle.variant"), dark,
            body ? Math.round(lum(rgb(body.ownerDocument.defaultView.getComputedStyle(body).backgroundColor)) * 100) / 100 : null];
          cw.gotoPref("paneCalendar"); await wait(1500);
          const days = [0, 1, 2, 3, 4, 5, 6].map(i => cd.getElementById("dayoff" + i)).filter(Boolean);
          days[1].scrollIntoView({ block: "center" }); await wait(300);
          const labs = days.map(b => b.querySelector(".checkbox-label").getBoundingClientRect());
          out.days = [days.length, Math.max(...days.map((b, i) => Math.abs(mid(b.querySelector(".checkbox-check").getBoundingClientRect()) - mid(labs[i])))),
            Math.min(...labs.slice(1).map((l, i) => l.left - labs[i].right))];
          // kleinste Fensterbreite: keine Seite breiter als der Inhaltsbereich
          w.resizeTo(800, 900); await wait(800);
          out.narrow = {};
          for (const p of ["paneGeneral", "paneAppearance", "paneCompose", "panePrivacy", "paneChat", "paneCalendar", "paneQrExport"]) {
            cw.gotoPref(p); await wait(700);
            const c = cd.getElementById("preferencesContainer");
            // abgeschnitten ist, was über die sichtbare Fläche (Innenabstand eingeschlossen) hinausragt
            const right = c.getBoundingClientRect().left + c.clientWidth;
            const over = [...cd.querySelectorAll(`#paneDeck [data-category="${p}"] :is(fieldset, .subcategory, #forwardMessageMode, #addExtension)`)]
              .filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > right + 1).length;
            out.narrow[p] = [c.scrollWidth - c.clientWidth, over];
          }
          w.resizeTo(1500, 950); await wait(500);
          tm.closeTab(tm.currentTabInfo);
          return out;""")
        narrow_ok = all(v[0] <= 1 and v[1] == 0 for v in res["narrow"].values())
        chat = res["chat"]
        chat_ok = (chat[0] == "Dark" and chat[2] is not None and chat[2] < 0.2) if chat[1] else (chat[0] != "Dark" and chat[2] is not None and chat[2] > 0.5)
        ok = (res["abEdit"] == ["38px", "500"] and res["tags"] and min(res["tags"]) >= 4.5
              and isinstance(res.get("history"), list) and res["history"][0] >= 6 and res["history"][1] >= 4
              and res.get("port") == ["none", "center", "7px"] and res["edit"] == [True, "400"]
              and res["preview"][0] >= 6 and res["preview"][1:] == ["8px", True] and chat_ok
              and res["days"][0] == 7 and res["days"][1] <= 1 and res["days"][2] >= 4 and narrow_ok
              and res["size"][0] <= 100 and res["size"][0] < res["size"][1] / 2
              and bool(res.get("dev")) and res["dev"][1] is True and res["dev"][0] >= 250 and res["dev"][2] >= 6 and res["dev"][3] is True)
        return ok, f"{res}"
    check("Einstellungen: Arbeitstage, Chat-Vorschau (dunkel „Dark“), Schlagwörter lesbar, Knöpfe, Update-Chronik, Ports, schmales Fenster, Schriftgröße, Kryptographie-Module", settings_details, results)

    def account_pages():
        # Kontoeinstellungen: „Add-ons and Themes“ einzeilig, Seiten dunkel in --mt-window, Überschrift mit 12 px
        # Abstand zur ersten Karte, Junk ohne doppelten Kartenabstand und mit niedrigen Adressbuch-Zeilen, deren
        # Auswahl das Kästchen nicht verdeckt, „Default: 587“ mit Abstand, Archiv-Beispiel mit Haarlinie und 8 px
        res = m.js(r"""
          w.resizeTo(1500, 950); w.MsgAccountManager(null);
          const aw = await until(() => tm.currentTabInfo.browser?.contentWindow?.document.getElementById("accounttree") && tm.currentTabInfo.browser.contentWindow, 8000);
          await wait(1200); const ad = aw.document;
          const cs = e => e.ownerDocument.defaultView.getComputedStyle(e); const R = e => e.getBoundingClientRect();
          const out = { dark: w.matchMedia("(prefers-color-scheme: dark)").matches };
          out.footer = [...ad.querySelectorAll("#accountTreeBox .sidebar-footer-label")].filter(e => R(e).width).map(e => [Math.round(R(e).height), cs(e).whiteSpace]);
          const probe = ad.createElementNS("http://www.w3.org/1999/xhtml", "div"); probe.style.color = "var(--mt-window)"; ad.documentElement.append(probe);
          const line = ad.createElementNS("http://www.w3.org/1999/xhtml", "div"); line.style.color = "var(--mt-pane-line)"; ad.documentElement.append(line);
          const winColor = cs(probe).color, lineColor = cs(line).color; probe.remove(); line.remove();
          const tree = ad.getElementById("accounttree");
          const page = async tag => { const li = [...tree.querySelectorAll("li")].find(l => (l.getAttribute("PageTag") || "") == tag);
            if (!li) return null; tree.selectedIndex = tree.rows.indexOf(li);
            return await until(() => { const d = ad.getElementById("contentFrame").contentDocument;
              return d?.readyState == "complete" && d.location.href.includes(tag) && d.getElementById("containerBox") && d; }, 8000); };
          const sub = async () => { const f = await until(() => [...ad.querySelectorAll(".dialogFrame")].find(fr => fr.contentDocument?.readyState == "complete" && fr.contentDocument.location.href != "about:blank"), 8000);
            await wait(600); return f?.contentDocument; };
          const headGap = d => { const h = d.querySelector("#containerBox > .dialogheader"); const f = [...d.querySelectorAll("#containerBox fieldset")].find(e => R(e).width);
            return h && f ? Math.round(R(f).top - R(h).bottom) : null; };
          out.gap = {}; out.bg = {};
          for (const tag of ["am-copies.xhtml", "am-junk.xhtml", "am-offline.xhtml", "am-smtp.xhtml"]) {
            const d = await page(tag); if (!d) { out.gap[tag] = "fehlt"; continue; } await wait(500);
            out.bg[tag] = cs(d.documentElement).backgroundColor == winColor;
            if (tag != "am-smtp.xhtml") out.gap[tag] = headGap(d);
            if (tag == "am-junk.xhtml") {
              const fs = [...d.querySelectorAll("#containerBox > div > fieldset")].filter(e => R(e).width);
              out.junkGap = fs.length > 1 ? Math.round(R(fs[1]).top - R(fs[0]).bottom) : null;
              const wl = d.getElementById("whiteListAbURI"); const items = [...wl.children].filter(e => R(e).width);
              // Zeilenhöhe: unter Linux mit GTK-Kästchen und Systemschrift 32 px statt höchstens 30
              out.rows = items.map(e => Math.round(R(e).height));
              const it = items[0], cb = it.querySelector("checkbox"), was = cb.checked;
              cb.checked = true; wl.selectedIndex = 0; await wait(200);
              out.sel = cs(it).backgroundColor != cs(it.querySelector(".checkbox-check")).backgroundColor;
              cb.checked = was;
            }
            if (tag == "am-copies.xhtml") {
              const b = d.getElementById("archiveHierarchyButton"); b.scrollIntoView({ block: "center" });
              setTimeout(() => b.click(), 0); const sd = await sub();
              if (sd) { const p = sd.getElementById("archiveTree").parentElement;
                out.archive = [cs(p).borderTopColor == lineColor, cs(p).borderTopLeftRadius, parseFloat(cs(p).borderTopWidth) <= 1];
                const dl = sd.querySelector("dialog"); if (dl?.cancelDialog) dl.cancelDialog(); else sd.defaultView.close(); await wait(600); }
            }
            if (tag == "am-smtp.xhtml") {
              const b = d.getElementById("addButton"); setTimeout(() => b.click(), 0); const sd = await sub();
              if (sd) { const sp = sd.getElementById("smtp.port"), l1 = sp.nextElementSibling, l2 = sd.getElementById("smtp.defaultPort");
                out.smtp = [Math.round(R(l1).left - R(sp).right), Math.round(R(l2).left - R(l1).right)];
                const dl = sd.querySelector("dialog"); if (dl?.cancelDialog) dl.cancelDialog(); else sd.defaultView.close(); await wait(600); }
            }
          }
          tm.closeTab(tm.currentTabInfo);
          return out;""")
        ok = (bool(res["footer"]) and all(h < 30 and ws == "nowrap" for h, ws in res["footer"])
              and all(res["bg"].values()) and len(res["bg"]) == 4
              and all(isinstance(v, int) and 10 <= v <= 16 for v in res["gap"].values())
              and res.get("junkGap") is not None and res["junkGap"] <= 16
              and res.get("rows") and all(22 <= h <= (30 if sys.platform == "darwin" else 34) for h in res["rows"]) and res.get("sel") is True
              and res.get("archive") == [True, "8px", True]
              and res.get("smtp") and min(res["smtp"]) >= 4)
        return ok, f"{res}"
    check("Kontoeinstellungen: Fußzeile einzeilig, Fläche --mt-window, Abstände Überschrift/Karten, Junk-Adressbücher, SMTP-Port, Archiv-Beispiel", account_pages, results)

    def account_sidebar_toggle():
        # Seitenleiste in den Kontoeinstellungen ausblenden: Kontodetails bleiben sichtbar und füllen die Breite
        # (vorher rutschten sie in die 12 px schmale erste Rasterspalte – nur weiße Fläche)
        res = m.js(r"""
          w.resizeTo(1500, 950); w.MsgAccountManager(null);
          const aw = await until(() => tm.currentTabInfo.browser?.contentWindow?.document.getElementById("accounttree") && tm.currentTabInfo.browser.contentWindow, 8000);
          await wait(1200); const ad = aw.document, cf = ad.getElementById("contentFrame"), box = ad.getElementById("accountTreeBox");
          const W = e => Math.round(e.getBoundingClientRect().width), btn = d.getElementById("spacesPinnedButton");
          const out = { before: W(cf), page: W(ad.body) };
          btn.click(); await until(() => box.classList.contains("mc-side-hidden"), 3000); await wait(500);
          const fd = cf.contentDocument;
          out.hidden = { frame: W(cf), left: Math.round(cf.getBoundingClientRect().left), content: fd?.getElementById("containerBox") ? W(fd.getElementById("containerBox")) : null };
          btn.click(); await until(() => !box.classList.contains("mc-side-hidden") && !box.__mcAnimating, 3000); await wait(500);
          out.after = { frame: W(cf), tree: W(box) };
          tm.closeTab(tm.currentTabInfo); await wait(500);
          return out;""")
        h = res["hidden"]
        ok = (h["frame"] >= res["page"] - 2 and h["left"] <= 1 and h["content"] and h["content"] > 300
              and abs(res["after"]["frame"] - res["before"]) <= 2 and res["after"]["tree"] > 150)
        return ok, f"{res}"
    check("Kontoeinstellungen: Seitenleiste aus- und wieder einblenden, Kontodetails bleiben sichtbar und nutzen die volle Breite", account_sidebar_toggle, results)

    PREFS_OPEN_JS = r"""
          w.resizeTo(1500, 900); await wait(400);
          w.openPreferencesTab("paneGeneral");
          const pw = await until(() => tm.currentTabInfo.browser?.contentWindow?.document.getElementById("paneDeck") && tm.currentTabInfo.browser.contentWindow, 8000);
          await until(() => pw.document.getElementById("mcCat-paneMcHalo"), 6000);
          const pd = pw.document, host = tm.currentTabInfo.browser.parentNode;
          const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
          const pick = async (v, ms = 3000) => { (pd.getElementById("mcCat-" + v) || pd.getElementById("category-general")).click(); await wait(ms); };
          const page = src => host.querySelector(`.mc-embed-page[src="${src}"]`);
    """

    def pref_halo_category():
        # Einstellungen: eigene Kategorie „halo.spaces“ mit der Einstellungsseite der Erweiterung (options_ui bleibt zusätzlich)
        res = m.js(PREFS_OPEN_JS + r"""
          const item = pd.getElementById("mcCat-paneMcHalo"), img = item?.querySelector("img");
          const out = { label: item?.querySelector(".category-name")?.textContent, icon: img ? [img.src.slice(0, 5), img.naturalWidth > 0] : null,
                        // Symbol ohne eigene weiße Kachel auf den Ring zugeschnitten – so groß wie die übrigen Kacheln
                        crop: !!img?.src.includes(encodeURIComponent('viewBox="8 8 48 48"')), size: img ? Math.round(img.getBoundingClientRect().width) : null,
                        other: Math.round(pd.querySelector("#category-general .category-icon").getBoundingClientRect().width),
                        footerHidden: !!pd.querySelector("#pref-category-box .sidebar-footer-list")?.hidden,
                        tile: w.getComputedStyle ? pw.getComputedStyle(img).backgroundColor : null,
                        qrTile: pw.getComputedStyle(pd.querySelector("#category-qrexport .category-icon") || pd.body).backgroundColor };
          await pick("paneMcHalo", 3500);
          const b = pd.querySelector("#mcPane-paneMcHalo > browser");
          out.pane = { embed: pd.documentElement.hasAttribute("mc-embed"), remote: b?.isRemoteBrowser, url: b?.currentURI?.spec.replace(/^moz-extension:\/\/[^/]+/, ""),
                       rect: R(b), cat: R(pd.getElementById("pref-category-box")), hash: pw.location.hash };
          await pick("paneGeneral", 800); out.back = !pd.documentElement.hasAttribute("mc-embed");
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        manifest = json.load(open(os.path.join(ROOT, "extension", "manifest.json")))
        p = res.get("pane", {})
        ok = (res["label"] == "halo.spaces" and res["icon"] == ["data:", True] and res["footerHidden"] and rgba_alpha(res["tile"]) == 0
              and res["crop"] and res["size"] == res["other"]
              and p.get("embed") and p.get("remote") and p.get("url") == "/options/options.html?in=prefs" and p["rect"]["h"] > 500
              and p["rect"]["l"] == p["cat"]["l"] + p["cat"]["w"] and p.get("hash") == "#mcHalo" and res["back"]
              and manifest.get("options_ui", {}).get("page") == "options/options.html")
        return ok, f"{res}"
    check("Einstellungen: eigene Kategorie „halo.spaces“ mit der Einstellungsseite der Erweiterung (Add-ons → Einstellungen bleibt)", pref_halo_category, results)

    def options_minimal():
        # Einstellungsseite minimalistisch: Abhängiges erst bei Bedarf (Ort nur mit Wetter, Stichwörter nur mit Emojis),
        # Chat als Schalter mit „Stattdessen“ bei Aus, Einzelheiten im ⓘ, Fehlerbehebung eingeklappt, keine Gedankenstriche.
        # Die Seite läuft hier in einem Testfenster mit nachgebildeter Schnittstelle (die echte liegt im Erweiterungsprozess)
        res = m.js(r"""
          const saved = [];
          const settings = { mac: true, darkReader: true, fullConversation: true, unreadTint: false, undoSend: 10, senderLogos: true,
            macContactPhotos: false, darkMessages: true, plainTextSystemFont: true, hideCollectedAddresses: true, calendarEmoji: true,
            emojiCustom: "", weather: false, weatherPlace: "", calendarOffline: false, fifthSpace: "chat", fifthSpaceAddon: "",
            fifthSpaceUrl: "", fifthSpaceIcon: "mask", fifthSpaceAddons: [], inlinePrompts: true, earlyTheme: false, autoUpdate: true,
            bundledTheme: true, appleIcons: true, debug: false };
          const obs = { observe(doc) {
            if (!doc.location?.href.startsWith("resource://mailcards/options/options.html")) return;
            const win = doc.defaultView;
            win.wrappedJSObject.browser = Cu.cloneInto({ mailCards: {
              getSettings: () => win.Promise.resolve(Cu.cloneInto(settings, win)),
              getTranslations: () => win.Promise.resolve(Cu.cloneInto({ lang: "en", table: {} }, win)),
              setSetting: (k, v) => { saved.push([k, v]); settings[k] = v; return win.Promise.resolve(v); },
              searchPlaces: () => win.Promise.resolve(Cu.cloneInto([], win)),
              choosePlace: () => win.Promise.resolve() } }, win, { cloneFunctions: true });
          } };
          Services.obs.addObserver(obs, "document-element-inserted");
          const ow = w.openDialog("resource://mailcards/options/options.html", "", "chrome,dialog=no,width=700,height=900");
          try {
            const od = await until(() => ow.document?.getElementById("row-weather") && ow.document, 8000);
            if (!od) return { page: false };
            await wait(400);
            const shown = id => { const r = od.getElementById("row-" + id); return !!r && !r.hidden && r.getBoundingClientRect().height > 0; };
            const out = { page: true, start: { place: shown("weatherPlace"), emoji: shown("emojiCustom"), chat: shown("showChat"), instead: shown("fifthSpace"),
              url: shown("fifthSpaceUrl"), debug: shown("debug"), dashes: od.body.textContent.includes(" – "),
              infos: od.querySelectorAll(".row .info[title]").length, disclosure: !!od.querySelector("h2 .disclosure[aria-expanded='false']") } };
            od.getElementById("s-weather").click(); await wait(500);
            out.weatherOn = shown("weatherPlace");
            od.getElementById("s-calendarEmoji").click(); await wait(500);
            out.emojiOff = shown("emojiCustom");
            od.getElementById("s-showChat").click(); await wait(500);
            out.chatOff = { instead: shown("fifthSpace"), value: od.getElementById("s-fifthSpace")?.value, mode: settings.fifthSpace };
            const sel = od.getElementById("s-fifthSpace"); sel.value = "web"; sel.dispatchEvent(new ow.Event("change")); await wait(500);
            out.web = { url: shown("fifthSpaceUrl"), icon: shown("fifthSpaceIcon"), mode: settings.fifthSpace };
            od.getElementById("s-showChat").click(); await wait(500);
            out.chatOn = { instead: shown("fifthSpace"), url: shown("fifthSpaceUrl"), mode: settings.fifthSpace };
            od.querySelector("h2 .disclosure").click(); await wait(500);
            out.troubleshoot = shown("debug");
            return out;
          } finally { Services.obs.removeObserver(obs, "document-element-inserted"); ow.close(); }""")
        if not res.get("page"):
            return False, f"{res}"
        st = res["start"]
        ok = (not st["place"] and st["emoji"] and st["chat"] and not st["instead"] and not st["url"] and not st["debug"]
              and not st["dashes"] and st["infos"] >= 8 and st["disclosure"]
              and res["weatherOn"] and not res["emojiOff"]
              and res["chatOff"] == {"instead": True, "value": "none", "mode": "none"}
              and res["web"] == {"url": True, "icon": True, "mode": "web"}
              and res["chatOn"] == {"instead": False, "url": False, "mode": "chat"} and res["troubleshoot"])
        return ok, f"{res}"
    check("Einstellungen minimalistisch: Abhängiges erst bei Bedarf, Chat als Schalter mit „Stattdessen“, Einzelheiten im ⓘ, Fehlerbehebung eingeklappt", options_minimal, results)

    def pref_halo_search():
        # Suche der Einstellungen findet die Optionen von halo.spaces („update“ → „Install updates at start“, „logos“ →
        # „Logos from sender websites“), Treffer wie Thunderbirds eigene markiert; „Show“ öffnet halo.spaces bei der Option
        res = m.js(PREFS_OPEN_JS + r"""
          const input = pd.getElementById("searchInput");
          const search = async q => { input.value = q; input.dispatchEvent(new pw.Event("command", { bubbles: true })); input.dispatchEvent(new pw.Event("input", { bubbles: true }));
            await until(() => pd.getElementById("header-searchResults") && !pd.getElementById("header-searchResults").hidden, 3000); await wait(900);
            return [...pd.querySelectorAll("#paneDeck > .mc-halo-found")].filter(e => !e.hidden && !e.classList.contains("visually-hidden") && e.getBoundingClientRect().height > 0)
              .map(e => e.querySelector(".mc-halo-found-name").textContent); };
          const out = {};
          out.normal = [...pd.querySelectorAll("#paneDeck > .mc-halo-found")].filter(e => e.getBoundingClientRect().height > 0).length;
          out.update = await search("update");
          out.marked = pw.gSearchResultsPane.getFindSelection(pw).rangeCount > 0;
          out.logos = await search("logos");
          const hit = [...pd.querySelectorAll("#paneDeck > .mc-halo-found")].find(e => !e.classList.contains("visually-hidden") && e.getBoundingClientRect().height > 0);
          hit?.querySelector(".mc-halo-found-show").click();
          const b = await until(() => { const x = pd.querySelector("#mcPane-paneMcHalo > browser"); return x?.currentURI?.spec.includes("#s-") && x; }, 6000);
          out.after = { cat: pd.getElementById("categories").selectedItem?.value, url: b?.currentURI?.spec.replace(/^moz-extension:\/\/[^/]+/, ""), search: input.value };
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        ok = (res.get("normal") == 0 and "Install updates at start" in res.get("update", []) and res.get("marked")
              and res.get("logos") == ["Logos from sender websites"]
              and res.get("after", {}).get("cat") == "paneMcHalo" and res["after"].get("url", "").endswith("#s-senderLogos") and res["after"].get("search") == "")
        return ok, f"{res}"
    check("Einstellungen: Suche findet die Optionen von halo.spaces, „Show“ zeigt die Option", pref_halo_search, results)

    def pref_shortcuts_link():
        # Allgemein: Karte mit Link zu den offiziellen Tastaturkürzeln (Mozilla-Hilfe in der Sprache von Thunderbird),
        # unter „General“ vor „Language & Fonts“; nur bei „Allgemein“ sichtbar, die Suche findet sie
        res = m.js(PREFS_OPEN_JS + r"""
          await pick("paneGeneral", 1200);
          const card = pd.getElementById("mcShortcuts"), a = card?.querySelector("a.text-link");
          const out = { card: !!card, shown: !!card && card.getBoundingClientRect().height > 0, href: a?.getAttribute("href"), text: a?.textContent,
                        next: card?.nextElementSibling?.id, locale: Services.locale.appLocaleAsBCP47,
                        legend: card ? pw.getComputedStyle(card.querySelector("legend")).fontWeight : null };
          await pick("paneMcHalo", 1500); out.hiddenElsewhere = !!card && card.getBoundingClientRect().height == 0;
          const input = pd.getElementById("searchInput"); input.value = "shortcuts"; input.dispatchEvent(new pw.Event("command", { bubbles: true }));
          input.dispatchEvent(new pw.Event("input", { bubbles: true })); await wait(1500);
          out.found = !!card && !card.classList.contains("visually-hidden") && card.getBoundingClientRect().height > 0;
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        lang = "en-US" if res.get("locale", "").startswith("en") else res.get("locale")
        ok = (res.get("shown") and res.get("next") == "languageAndFontsCategory" and res.get("hiddenElsewhere") and res.get("found")
              and res.get("href") == f"https://support.mozilla.org/{lang}/kb/keyboard-shortcuts-thunderbird")
        return ok, f"{res}"
    check("Einstellungen → Allgemein: Link zu den Tastaturkürzeln in der Sprache von Thunderbird", pref_shortcuts_link, results)

    def options_page_slim():
        # Einstellungsseite schlank: Breite der Mailliste und doppelte Kontakte nur in der Oberfläche,
        # Design/Symbole/Protokoll unter „Fehlerbehebung“; options.js (Seite läuft entfernt) in einer
        # Sandbox auswerten, Texte gegen die Übersetzungstabellen; Vorgaben im frischen Profil
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const ext = ExtensionParent.GlobalManager.getExtension("%s"), g = ext.experimentAPIManager.global;
          const src = await (await fetch(ext.baseURL + "options/sections.js")).text() + "\\n" + await (await fetch(ext.baseURL + "options/options.js")).text();
          const sb = Cu.Sandbox(null);
          sb.browser = Cu.cloneInto({ mailCards: {} }, sb);
          Cu.evalInSandbox(src.replace(/\\nrender\\(\\)[^\\n]*\\s*$/, "\\n").replace(/\\nwindow\\.addEventListener[^\\n]*/, "\\n"), sb);
          const sections = JSON.parse(Cu.evalInSandbox("JSON.stringify(SECTIONS(t))", sb)).map(([title, rows]) => [title, rows.filter(r => r.type != "chat").map(r => r.key)]);
          const used = [...src.matchAll(/\\bt\\("((?:[^"\\\\]|\\\\.)*)"\\)/g)].map(x => JSON.parse('"' + x[1] + '"'));
          const T = Cu.evalInSandbox("TRANSLATIONS", g), SETTINGS = Cu.evalInSandbox("SETTINGS", g);
          const api = Cu.evalInSandbox("mailCards.prototype.getAPI({})", g).mailCards, st = await api.getSettings();
          const gone = ["Message list width", "pixels; double-click the divider to reset", "Merge duplicate contacts", "display only", "Default",
                        "Preview lines in the message list", "Birthdays from the address book", "separate read-only calendar"];
          return { sections, missing: Object.entries(T).flatMap(([l, tab]) => used.filter(u => !(u in tab) && !["Mail", "Updates"].includes(u)).map(u => l + ":" + u)),
                   leftover: Object.entries(T).flatMap(([l, tab]) => gone.filter(k => k in tab).map(k => l + ":" + k)),
                   unknown: sections.flatMap(([, keys]) => keys).filter(k => !(k in SETTINGS)), inTable: ["listWidth", "hideDuplicateContacts", "previewLines", "birthdays"].filter(k => k in SETTINGS),
                   emoji: st.calendarEmoji, emojiStored: Services.prefs.prefHasUserValue("extensions.mailcards.calendarEmoji"),
                   width: Services.prefs.getIntPref("extensions.mailcards.listWidth", -1) > 0 || Cu.evalInSandbox("LIST_WIDTH_DEFAULT", g) > 0 };''' % ADDON_ID)
        keys = [k for _, ks in res["sections"] for k in ks]
        last = res["sections"][-1][1] if res["sections"] else []
        ok = (not {"listWidth", "hideDuplicateContacts", "previewLines", "birthdays"} & set(keys) and "calendarEmoji" in keys and "macContactPhotos" in keys
              and last == ["bundledTheme", "appleIcons", "debug"] and keys.count("bundledTheme") == 1 and keys.count("appleIcons") == 1
              and not res["missing"] and not res["leftover"] and not res["unknown"] and not res["inTable"]
              and res["emoji"] is True and not res["emojiStored"] and res["width"])
        return ok, f"{res}"
    check("Einstellungen: Seite ohne Breite der Mailliste, doppelte Kontakte, Vorschauzeilen und Geburtstage, Design/Symbole/Protokoll unter „Fehlerbehebung“; Kalender-Emojis im frischen Profil an", options_page_slim, results)

    def preview_menu():
        # Ansicht → Vorschauzeilen (Menüleiste und App-Menü): Häkchen am aktuellen Wert,
        # Auswahl ändert Zeilen und Kartenhöhe sofort, 0 entfernt die Vorschau, 1 = Standard ohne Pref
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const PREF = "extensions.mailcards.previewLines";
          const menu = d.getElementById("mcPreviewLines"), popup = d.getElementById("mcPreviewLinesPopup");
          const nav = d.getElementById("appmenu_mcPreviewLines"), view = d.getElementById("mcPreviewLinesView");
          if (!menu || !popup) return { menu: false };
          const place = { parent: menu.parentNode?.id, after: menu.previousElementSibling?.id, app: nav?.previousElementSibling?.id,
                          appButtons: view ? view.querySelectorAll("toolbarbutton[type=radio]").length : 0 };
          const labels = [...popup.children].map(i => i.getAttribute("label"));
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Vorschau")) { root.createSubfolder("Vorschau", null); await wait(800); }
          const f = root.getChildNamed("Vorschau");
          if (!f.getTotalMessages(false)) {
            f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Mon Jan 05 10:00:00 2026\\r\\nFrom: Halo Vorschau <vorschau@example.invalid>\\r\\nSubject: Vorschauzeilen\\r\\nDate: Mon, 05 Jan 2026 10:00:00 +0100\\r\\nMessage-ID: <halo-vorschau@example.invalid>\\r\\n\\r\\nEine erste Zeile Text fuer die Vorschau der Karte.\\r\\n");
          }
          const a3 = await toMail();
          const viewBefore = Services.prefs.getIntPref("mail.threadpane.listview", 0);
          Services.prefs.setIntPref("mail.threadpane.listview", 0); await wait(600);
          a3.displayFolder(f.URI);
          const Card = a3.customElements.get("thread-card");
          const row = () => a3.document.querySelector(\'#threadTree tr[is="thread-card"]\');
          await until(() => row()?.querySelector(".mc-preview"), 8000);
          const pick = async n => {
            [...popup.children].find(i => i.getAttribute("value") == String(n)).doCommand();
            await wait(900);
            popup.dispatchEvent(new w.Event("popupshowing"));
            const pv = row()?.querySelector(".mc-preview");
            return { pref: Services.prefs.prefHasUserValue(PREF) ? Services.prefs.getIntPref(PREF) : "standard", height: Card.ROW_HEIGHT,
                     clamp: pv ? a3.getComputedStyle(pv).webkitLineClamp : null, previews: a3.document.querySelectorAll(".mc-preview").length,
                     checked: [...popup.children].filter(i => i.hasAttribute("checked")).map(i => i.getAttribute("value")) };
          };
          const out = { place, labels, three: await pick(3), none: await pick(0), one: await pick(1) };
          // in der Tabelle ausgegraut
          Services.prefs.setIntPref("mail.threadpane.listview", 1); await wait(600);
          d.getElementById("menu_View_Popup").dispatchEvent(new w.Event("popupshowing"));
          out.tableDisabled = menu.disabled;
          Services.prefs.setIntPref("mail.threadpane.listview", viewBefore); await wait(600);
          d.getElementById("menu_View_Popup").dispatchEvent(new w.Event("popupshowing"));
          out.cardsEnabled = !menu.disabled;
          return out;''')
        if res.get("menu") is False:
            return False, "Untermenü Ansicht → Vorschauzeilen fehlt"
        t, z, o = res["three"], res["none"], res["one"]
        ok = (res["place"] == {"parent": "menu_View_Popup", "after": "menu_MessagePaneLayout", "app": "appmenu_MessagePaneLayout", "appButtons": 5}
              and len(res["labels"]) == 5 and len(set(res["labels"])) == 5
              and t["pref"] == 3 and t["clamp"] == "3" and t["checked"] == ["3"]
              and z["pref"] == 0 and z["previews"] == 0 and z["checked"] == ["0"]
              and o["pref"] == "standard" and o["clamp"] == "1" and o["checked"] == ["1"] and o["previews"] > 0
              and t["height"] - o["height"] == 32 and z["height"] < o["height"]
              and res["tableDisabled"] and res["cardsEnabled"])
        return ok, f"{res}"
    check("Ansicht → Vorschauzeilen: Untermenü (Menüleiste und App-Menü), Auswahl ändert Vorschau und Kartenhöhe sofort ohne Neustart", preview_menu, results)

    def early_theme():
        # Option „Design ohne Aufblitzen beim Start“ (Standard aus): schreibt das Design als userChrome.css ins Profil
        # (eigene Kopfzeile) und schaltet das Laden ein; aus: Datei weg, Einstellung zurück; eine eigene Datei bleibt
        res = m.js(r"""
          const path = PathUtils.join(PathUtils.profileDir, "chrome", "userChrome.css");
          const L = "toolkit.legacyUserProfileCustomizations.stylesheets", E = "extensions.mailcards.earlyTheme";
          const read = async () => (await IOUtils.exists(path)) ? (await IOUtils.readUTF8(path)).slice(0, 200) : null;
          const out = { default: Services.prefs.getBoolPref(E, false), before: await read() };
          Services.prefs.setBoolPref(E, true); for (let i = 0; i < 40 && !(await IOUtils.exists(path)); i++) await wait(100); await wait(600);
          const on = await read(); out.on = { head: on?.split("\n")[0], legacy: Services.prefs.getBoolPref(L, false),
                                              design: (await IOUtils.readUTF8(path)).includes("halo.spaces – ruhiges Design für Thunderbird") };
          Services.prefs.setBoolPref(E, false); await wait(800);
          out.off = { file: await IOUtils.exists(path), legacy: Services.prefs.getBoolPref(L, false), set: Services.prefs.prefHasUserValue(L) };
          // eigene userChrome.css des Nutzers: nie überschreiben, nie löschen
          await IOUtils.makeDirectory(PathUtils.join(PathUtils.profileDir, "chrome"), { ignoreExisting: true });
          await IOUtils.writeUTF8(path, "/* meine eigene */\n");
          Services.prefs.setBoolPref(E, true); await wait(800); out.ownOn = await read();
          Services.prefs.setBoolPref(E, false); await wait(800); out.ownOff = await read();
          await IOUtils.remove(path); Services.prefs.clearUserPref(E); Services.prefs.clearUserPref(L);
          return out;""")
        on, off = res["on"], res["off"]
        ok = (res["default"] is False and res["before"] is None
              and (on["head"] or "").startswith("/* halo.spaces: automatisch geschrieben") and on["legacy"] and on["design"]
              and not off["file"] and not off["legacy"] and not off["set"]
              and res["ownOn"] == "/* meine eigene */\n" and res["ownOff"] == "/* meine eigene */\n")
        return ok, f"{res}"
    check("Einstellungen: „Design ohne Aufblitzen“ schreibt userChrome.css ins Profil und räumt beim Ausschalten auf, eigene Datei bleibt", early_theme, results)

    def pref_embedded_pages():
        # Kontoeinstellungen und Add-ons als Kategorien: Seitenleiste bleibt stehen (gleiche Breite), Inhalt rechts daneben,
        # Kontoseite 28 px neben der Seitenleiste wie die übrigen Einstellungen; Seitenleiste ausblenden zieht die Seite nach links
        res = m.js(PREFS_OPEN_JS + r"""
          const out = { general: { cat: R(pd.getElementById("pref-category-box")), content: R(pd.querySelector(".paneDeckContainer")) } };
          await pick("paneMcAccounts", 3500);
          const acc = page("about:accountsettings"), fd = acc?.contentDocument, inner = fd?.getElementById("contentFrame")?.contentDocument;
          const box = inner?.getElementById("containerBox"), fr = fd?.getElementById("contentFrame");
          out.accounts = { cat: R(pd.getElementById("pref-category-box")), page: R(acc), hidden: acc?.hidden, inner: inner?.location.href.split("/").pop(),
                           gaps: box && fr ? [Math.round(box.getBoundingClientRect().left), Math.round(fr.getBoundingClientRect().width - box.getBoundingClientRect().right)] : null,
                           footer: fd ? fd.defaultView.getComputedStyle(fd.querySelector("#accountTreeBox .sidebar-footer-list")).display : null };
          await pick("paneMcAddons", 3500);
          const ad = page("about:addons");
          out.addons = { cat: R(pd.getElementById("pref-category-box")), page: R(ad), hidden: ad?.hidden, accHidden: acc?.hidden,
                         view: ad?.contentWindow?.gViewController?.currentViewId, card: !!ad?.contentDocument.querySelector('addon-card[addon-id="mail-cards@sebastian.local"]') };
          const btn = d.getElementById("spacesPinnedButton");
          btn.click(); await until(() => pd.getElementById("pref-category-box").classList.contains("mc-side-hidden"), 3000); await wait(500);
          out.sideHidden = R(ad);
          btn.click(); await until(() => !pd.getElementById("pref-category-box").classList.contains("mc-side-hidden"), 3000); await wait(600);
          out.sideShown = R(ad);
          await pick("paneGeneral", 800); out.back = { acc: acc?.hidden, ad: ad?.hidden, cat: R(pd.getElementById("pref-category-box")) };
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        g, a, ad = res["general"], res["accounts"], res["addons"]
        right = g["cat"]["l"] + g["cat"]["w"]
        ok = (a["cat"] == g["cat"] and ad["cat"] == g["cat"] and res["back"]["cat"] == g["cat"]
              and a["hidden"] is False and a["page"]["l"] - res["general"]["cat"]["l"] >= 0 and a["inner"] and a["inner"].startswith("am-")
              and a["gaps"] and a["gaps"][0] == 28 and a["footer"] == "none"
              and ad["hidden"] is False and ad["accHidden"] is True and ad["view"] == "addons://list/extension" and ad["card"]
              and res["sideHidden"]["w"] > ad["page"]["w"] + 150 and res["sideShown"] == ad["page"]
              and res["back"]["acc"] is True and res["back"]["ad"] is True)
        return ok, f"Seitenleiste rechts bei {right} {res}"
    check("Einstellungen: Kontoeinstellungen und Add-ons als Kategorien, Seitenleiste bleibt gleich breit, Kontoseite linksbündig, Ausblenden zieht mit", pref_embedded_pages, results)

    def pref_embedded_subnav():
        # keine zweite graue Leiste: Konten (mit Seiten des gewählten Kontos) bzw. Extensions/Themes … als eingerückte
        # Unterpunkte der Kategorie, nur bei gewählter Kategorie; Klick wählt in der Seite, „Konto hinzufügen“ öffnet das Menü
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
        """ + PREFS_OPEN_JS + r"""
          const list = v => [...pd.querySelectorAll(`#mcSub-${v} .mc-subcat`)].map(e => [+e.getAttribute("level"), e.textContent, e.hasAttribute("current")]);
          const vis = v => !pd.getElementById("mcSub-" + v).hidden;
          const out = { general: [vis("paneMcAccounts"), vis("paneMcAddons")] };
          await pick("paneMcAccounts", 3500);
          const acc = page("about:accountsettings"), fd = acc.contentDocument, tree = fd.getElementById("accounttree");
          const local = MailServices.accounts.localFoldersServer.key;
          // Konto „Lokale Ordner“ wählen, dann seine zweite Seite (Speicherplatz)
          [...pd.querySelectorAll("#mcSub-paneMcAccounts .mc-subcat[level='1']")].find(e => e.textContent == tree.querySelector(`li[data-server-key="${local}"] .name`).textContent).click(); await wait(1500);
          out.acc = list("paneMcAccounts"); out.vis = [vis("paneMcAccounts"), vis("paneMcAddons")];
          out.parentBg = pw.getComputedStyle(pd.getElementById("mcCat-paneMcAccounts")).backgroundColor;
          out.tree = Math.round(fd.getElementById("accountTreeBox").getBoundingClientRect().width);
          out.frameLeft = Math.round(fd.getElementById("contentFrame").getBoundingClientRect().left);
          pd.querySelectorAll("#mcSub-paneMcAccounts .mc-subcat[level='2']")[1]?.click(); await wait(1500);
          out.acc2 = list("paneMcAccounts"); out.inner = fd.getElementById("contentFrame").contentDocument?.location.href.split("/").pop();
          const pop = fd.getElementById("accountAddPopup") || fd.getElementById("accountActionsDropdown");
          pd.querySelector("#mcSub-paneMcAccounts .mc-subcat-action")?.click(); await wait(800); out.popup = pop?.state; pop?.hidePopup(); await wait(300);
          await pick("paneMcAddons", 3500);
          const ad = page("about:addons"), aw = ad.contentWindow;
          out.add = list("paneMcAddons"); out.vis2 = [vis("paneMcAccounts"), vis("paneMcAddons")];
          out.side = Math.round(ad.contentDocument.getElementById("sidebar").getBoundingClientRect().width);
          const theme = [...pd.querySelectorAll("#mcSub-paneMcAddons .mc-subcat")].find(e => e.textContent == ad.contentDocument.querySelector("#category-theme span, .category[viewid='addons://list/theme'] .category-name")?.textContent.trim());
          theme?.click(); await wait(1500);
          out.view = aw.gViewController?.currentViewId; out.add2 = list("paneMcAddons").filter(e => e[2]).map(e => e[1]);
          const main = ad.contentDocument.getElementById("main"), cat = pd.getElementById("pref-category-box").getBoundingClientRect();
          out.gaps = [Math.round(main.getBoundingClientRect().left), Math.round(ad.getBoundingClientRect().width - main.getBoundingClientRect().right)];
          // erneuter Klick auf die gewählte Kategorie klappt die Unterpunkte zu und wieder auf; Wechsel öffnet sie
          const tap = v => { const e = pd.getElementById("mcCat-" + v); e.dispatchEvent(new pw.MouseEvent("mousedown", { bubbles: true, button: 0 })); e.click(); };
          const fold = [vis("paneMcAddons")];
          tap("paneMcAddons"); await wait(300); fold.push(vis("paneMcAddons"));
          tap("paneMcAddons"); await wait(300); fold.push(vis("paneMcAddons"));
          tap("paneMcAddons"); await wait(300); await pick("paneMcAccounts", 1500); fold.push(vis("paneMcAccounts"));
          out.fold = fold;
          aw.gViewController.loadView("addons://list/extension"); await wait(800);
          await pick("paneGeneral", 800); out.back = [vis("paneMcAccounts"), vis("paneMcAddons")];
          tm.closeTab(tm.currentTabInfo); await wait(400);
          return out;""")
        acc, acc2, add = res["acc"], res["acc2"], res["add"]
        cur = [e for e in acc if e[2]]
        ok = (res["general"] == [False, False] and res["vis"] == [True, False] and res["vis2"] == [False, True] and res["back"] == [False, False]
              and len(cur) == 1 and cur[0][0] == 1 and sum(1 for e in acc if e[0] == 2) >= 2 and rgba_alpha(res["parentBg"]) == 0
              and res["tree"] == 0 and res["frameLeft"] <= 1
              and [e for e in acc2 if e[2]] == [[2, acc2[[i for i, e in enumerate(acc2) if e[0] == 2][1]][1], True]] and (res["inner"] or "").startswith("am-")
              and acc[-1][1].endswith("…") and res["popup"] == "open"
              and len(add) >= 3 and [e[1] for e in add if e[2]] and res["side"] == 0
              and res["view"] == "addons://list/theme" and len(res["add2"]) == 1 and res["gaps"][0] == 28
              and res["fold"] == [True, False, True, True])
        return ok, f"{res}"
    check("Einstellungen: Konten und Add-on-Bereiche als Unterpunkte in der Seitenleiste statt zweiter grauer Leiste, Klick wählt, erneuter Klick auf die Kategorie klappt sie zu und auf, Konto hinzufügen öffnet das Menü", pref_embedded_subnav, results)

    def account_wizards():
        # Konto-Assistenten (Feed, Newsgruppen, Chat): Knöpfe flach ohne Rahmen, 13 px, 28 px hoch und lesbar
        # (dunkel war „Cancel“ weiß auf #8F8F9D), Felder mit 7 px, Chat-Netzliste mit Haarlinie und 8 px
        res = m.js(r"""
          const rgba = c => { const v = (String(c).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); const k = String(c).startsWith("color(") ? 255 : 1;
            return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };
          const over = (fg, bg) => fg.slice(0, 3).map((x, i) => x * fg[3] + bg[i] * (1 - fg[3])).concat(1);
          const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; };
          const out = {};
          // nicht modal öffnen (wie Thunderbird, aber ohne „modal“), damit das Skript weiterläuft
          for (const [name, url] of [["feed", "chrome://messenger-newsblog/content/feedAccountWizard.xhtml"],
                                     ["news", "chrome://messenger/content/AccountWizard.xhtml"],
                                     ["chat", "chrome://messenger/content/chat/imAccountWizard.xhtml"]]) {
            const ww = w.openDialog(url, "_blank", "chrome,titlebar,centerscreen,dialog=no");
            await until(() => ww.document?.readyState == "complete" && ww.document.querySelector("wizard"), 10000);
            if (!ww.document?.querySelector("wizard")) { out[name] = "nicht offen"; ww.close(); continue; }
            await wait(800);
            const wd = ww.document, wz = wd.querySelector("wizard"), cs = e => ww.getComputedStyle(e);
            const b = wz.getButton("cancel"), s = cs(b), bg = rgba(cs(wd.documentElement).backgroundColor);
            const i = wd.querySelector("wizardpage:not([hidden]) input:not([type=checkbox], [type=radio])") || wd.querySelector("input:not([type=checkbox], [type=radio])");
            const r = { contrast: contrast(over(rgba(s.color), over(rgba(s.backgroundColor), bg)), over(rgba(s.backgroundColor), bg)),
              border: s.borderTopWidth, font: s.fontSize, h: Math.round(b.getBoundingClientRect().height),
              var: cs(wz).getPropertyValue("--button-border-color").trim(), input: i ? cs(i).borderTopLeftRadius : null };
            const pl = wd.getElementById("protolist");
            if (pl) { const it = pl.querySelector("richlistitem[selected]") || pl.querySelector("richlistitem");
              if (it && !it.selected) { pl.selectedItem = it; await wait(200); }
              r.list = [cs(pl).borderTopLeftRadius, rgba(cs(pl).borderTopColor)[3], it ? cs(it).borderTopLeftRadius : null]; }
            out[name] = r;
            ww.close(); await wait(400);
          }
          return out;""")
        ok = True
        for name in ("feed", "news", "chat"):
            r = res.get(name)
            ok = ok and isinstance(r, dict) and r["contrast"] >= 4.5 and r["border"] == "0px" and r["font"] == "13px" \
                and r["h"] >= 27 and r["var"] == "transparent" and r["input"] == "7px"
        c = res.get("chat")
        ok = ok and isinstance(c, dict) and c.get("list") and c["list"][0] == "8px" and c["list"][1] <= 0.15 and c["list"][2] == "6px"
        return ok, f"{res}"
    check("Konto-Assistenten: Knöpfe flach und lesbar, Felder 7 px, Chat-Netzliste mit Haarlinie und 8 px", account_wizards, results)

    def no_placeholder_in_ui():
        # Platzhalter für blockierte Bilder nur in Mails – nicht in der Oberfläche (Lupe im Suchfeld)
        res = m.js('''
          await toMail(); await wait(500);
          const imgs = [];
          const walk = root => { for (const el of root.querySelectorAll("*")) { if (el.localName == "img") imgs.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
          walk(d);
          const bad = imgs.filter(i => /M3 3l18 18/.test(w.getComputedStyle(i).backgroundImage)).map(i => i.id || i.className || i.getAttribute("alt"));
          return { imgs: imgs.length, bad };''')
        return res["imgs"] > 0 and not res["bad"], f"{res}"
    check("Oberfläche: kein Bild-Platzhalter außerhalb von Mails", no_placeholder_in_ui, results)

    def preview_entities():
        # Text-Teil mit &zwnj; (wie Amazon Visa) – Vorschau ohne Entities
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
          const root = MailServices.accounts.localFoldersServer.rootFolder;
          if (!root.containsChildNamed("Zeichen")) { root.createSubfolder("Zeichen", null); await wait(800); }
          const f = root.getChildNamed("Zeichen");
          if (!f.getTotalMessages(false)) {
            f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From: Halo <h@example.invalid>\r\nSubject: Zeichen\r\nDate: Sat, 17 Oct 2026 10:00:00 +0200\r\nMessage-ID: <halo-entities@example.invalid>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nInformationen zu deiner Karte &zwnj; &zwnj;&zwnj; Hallo &hellip; bis bald\r\n");
            await wait(800);
          }
          const a3 = await toMail(); a3.displayFolder(f.URI);
          const el = await until(() => [...a3.document.querySelectorAll('#threadTree tr[is="thread-card"] .mc-preview')].find(e => /Hallo/.test(e.textContent)), 8000);
          return { text: el?.textContent || null, visibility: d.visibilityState, rows: a3.gDBView?.rowCount };""")
        if res.get("text") is None and res.get("visibility") == "hidden":
            return True, f"Testfenster verdeckt (Karten nicht gezeichnet) – übersprungen {res}"
        text = res.get("text") or ""
        return "Hallo" in text and "&" not in text and "…" in text, f"{res}"
    check("Vorschau: HTML-Zeichen (&zwnj; …) aufgelöst", preview_entities, results)

    def tooltip_style():
        # eigene Tooltip-Fläche (sonst dunkle Schrift auf dunklem macOS-Tooltip)
        res = m.js(MESSAGE_JS + '''
          const md = a3.messageBrowser.contentDocument;
          const out = {};
          for (const [name, tip] of [["mail", d.getElementById("aHTMLTooltip")], ["message", md.getElementById("aHTMLTooltip")]]) {
            if (!tip) continue;
            const cs = tip.ownerDocument.defaultView.getComputedStyle(tip);
            out[name] = { app: cs.appearance, bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius };
          }
          const li = md.querySelector("#messageHeader li.header-recipient");
          out.title = li?.title;
          return out;''')
        tips = [res.get("mail"), res.get("message")]
        ok = all(t and t["app"] == "none" and t["bg"] not in ("", "transparent", "rgba(0, 0, 0, 0)") and t["radius"] == "6px" for t in tips) \
            and "@" in (res.get("title") or "")
        return ok, f"{res}"
    check("Tooltips: eigene Fläche mit lesbarer Schrift", tooltip_style, results)

    def space_tips():
        res = m.js('''
          return [...d.querySelectorAll("#spacesToolbar :is(#mailButton, #addressBookButton, #calendarButton, #tasksButton, #chatButton)")].map(b => b.title);''')
        ok = len(res) == 5 and all(t and "(" not in t and "⌃" not in t for t in res)
        return ok, f"{res}"
    check("Bereiche-Leiste: Tooltips nur mit Namen", space_tips, results)

    def fifth_space():
        # fünfter Bereich der Leiste: keiner (Chat weg, übrige Knöpfe gleich groß, Bereiche-Symbol mit fünf Feldern),
        # Bereich einer Erweiterung (Chat-Platz, Chat-Farbe, Symbol der Erweiterung, eigener Knopf weg, Inhalt 1:1
        # ohne Today-Pane) und feste Webseite (eigener Tab ohne Adressleiste, fremde Links im Browser)
        import http.server
        import threading
        page = b'<!doctype html><meta charset="utf-8"><title>Halo Webbereich</title><h1 id="t">Halo Webbereich</h1>'

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200 if self.path == "/" else 404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                if self.path == "/":
                    self.wfile.write(page)

            def log_message(self, *a):
                pass
        web = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=web.serve_forever, daemon=True).start()
        m.cmd("WebDriver:SetTimeouts", {"script": 120000})  # Erweiterung installieren und drei Zustände: länger als 30 s
        try:
            res = m.js(r"""
              const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
              const P = "extensions.mailcards.fifthSpace";
              const bar = d.getElementById("spacesToolbar"), chat = d.getElementById("chatButton");
              const shown = e => !!e && e.getBoundingClientRect().height > 0;
              const heights = () => [...bar.querySelectorAll(".spaces-toolbar-top-container > .spaces-toolbar-button")].filter(shown).map(b => Math.round(b.getBoundingClientRect().height));
              const out = { before: heights() };
              // keiner
              Services.prefs.setStringPref(P, "none"); await wait(500);
              const toggle = w.getComputedStyle(d.getElementById("mcSpacesToggle"), "::after").backgroundImage;
              out.none = { chat: shown(chat), heights: heights(), rects: (decodeURIComponent(toggle).match(/<rect/g) || []).length, item: d.getElementById("spacesPopupButtonChat")?.getAttribute("mc-fifth") };
              out.none.itemShown = !d.getElementById("spacesPopupButtonChat").hidden;
              // Erweiterung mit eigenem Bereich (vorübergehend installiert)
              const dir = PathUtils.join(PathUtils.profileDir, "halo-space-test");
              await IOUtils.makeDirectory(dir, { ignoreExisting: true });
              await IOUtils.writeUTF8(PathUtils.join(dir, "manifest.json"), JSON.stringify({ manifest_version: 2, name: "Halo Testbereich", version: "1.0",
                browser_specific_settings: { gecko: { id: "halo-space-test@example.invalid" } }, background: { scripts: ["background.js"] } }));
              await IOUtils.writeUTF8(PathUtils.join(dir, "background.js"), 'browser.spaces.create("halotest", "page.html", { title: "Halo Testbereich", defaultIcons: "icon.svg" });');
              await IOUtils.writeUTF8(PathUtils.join(dir, "page.html"), '<!doctype html><meta charset="utf-8"><title>Testbereich</title><body style="margin:0;font:20px serif"><h1 id="t" style="font-size:31px">Halo Testbereich</h1></body>');
              await IOUtils.writeUTF8(PathUtils.join(dir, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2a7"/></svg>');
              const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile); f.initWithPath(dir);
              const addon = await AddonManager.installTemporaryAddon(f);
              const space = await until(() => w.gSpacesToolbar.spaces.find(s => s.isExtensionSpace && s.button?.title == "Halo Testbereich"), 8000);
              out.addon = { space: !!space };
              if (space) {
                Services.prefs.setStringPref("extensions.mailcards.fifthSpaceAddon", space.name);
                Services.prefs.setStringPref(P, "addon"); await wait(600);
                const img = chat.querySelector("img");
                out.addon.chat = shown(chat); out.addon.title = chat.title; out.addon.ownShown = shown(space.button);
                out.addon.mask = w.getComputedStyle(img).maskImage.includes("moz-extension://");
                out.addon.heights = heights();
                chat.click();
                // (die Seite der Erweiterung läuft in deren eigenem Prozess – geprüft werden Adresse, Titel und Umgebung)
                const tab = await until(() => tm.currentTabInfo.mode.name == "contentTab" && tm.currentTabInfo.browser?.currentURI?.spec.startsWith("moz-extension://") && tm.currentTabInfo, 8000);
                await until(() => tab?.browser?.contentTitle == "Testbereich", 6000);
                out.addon.tab = !!tab; out.addon.url = !!tab?.browser?.currentURI?.spec.endsWith("/page.html"); out.addon.pageTitle = tab?.browser?.contentTitle;
                out.addon.current = chat.classList.contains("current");
                out.addon.today = shown(d.getElementById("today-pane-panel"));
                await toMail(); await wait(300);
                out.addon.afterMail = { current: chat.classList.contains("current"), today: shown(d.getElementById("today-pane-panel")) };
                for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
              }
              // feste Webseite
              Services.prefs.setStringPref("extensions.mailcards.fifthSpaceUrl", "http://127.0.0.1:%d/");
              Services.prefs.setStringPref(P, "web"); await wait(500);
              out.web = { title: chat.title, mask: w.getComputedStyle(chat.querySelector("img")).maskImage.includes("svg") };
              chat.click();
              const wt = await until(() => tm.currentTabInfo.mode.name == "contentTab" && tm.currentTabInfo.browser?.currentURI?.spec.includes("127.0.0.1") && tm.currentTabInfo, 8000);
              await until(() => wt?.browser?.contentTitle == "Halo Webbereich" || wt?.title == "Halo Webbereich", 6000);
              out.web.tab = !!wt; out.web.group = wt?.browser?.getAttribute("messagemanagergroup"); out.web.current = chat.classList.contains("current");
              out.web.today = shown(d.getElementById("today-pane-panel"));
              await toMail(); chat.click(); await wait(800);
              out.web.reused = tm.tabInfo.filter(t => t.mode.name == "contentTab").length;
              for (const t of [...tm.tabInfo].slice(1)) tm.closeTab(t);
              await toMail();
              // zurück: Chat
              for (const p of [P, "extensions.mailcards.fifthSpaceAddon", "extensions.mailcards.fifthSpaceUrl"]) Services.prefs.clearUserPref(p);
              await wait(500);
              out.back = { chat: shown(chat), title: chat.title, heights: heights(), extra: shown(space?.button) || shown(d.getElementById("spacesToolbarAddonsOverflowButton")) };
              // Einstellungsseite: nur bekannte Werte, Adresse nur http(s)
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const api = Cu.evalInSandbox("mailCards.prototype.getAPI({})", g).mailCards;
              const rejects = async (k, v) => { try { await api.setSetting(k, v); return false; } catch { return true; } };
              out.validate = [await rejects("fifthSpace", "bogus"), await rejects("fifthSpaceUrl", "javascript:alert(1)"),
                              await rejects("fifthSpaceIcon", "x"), await api.setSetting("fifthSpaceUrl", "kalender.example.com")];
              out.listed = (await api.getSettings()).fifthSpaceAddons?.map(a => a.label);
              for (const p of ["extensions.mailcards.fifthSpaceUrl"]) Services.prefs.clearUserPref(p);
              await addon?.uninstall?.(); await wait(300);
              return out;""" % (web.server_port, ADDON_ID))
        finally:
            m.cmd("WebDriver:SetTimeouts", {"script": 30000})
            web.shutdown()
            web.server_close()
        n, a, wb, bk = res.get("none") or {}, res.get("addon") or {}, res.get("web") or {}, res.get("back") or {}
        before = res.get("before") or []
        ok = (len(before) == 5 and not n.get("chat") and len(n.get("heights", [])) == 4 and max(n["heights"]) - min(n["heights"]) <= 1
              and n["heights"][0] > before[0] and n.get("rects") == 5 and not n.get("itemShown")
              and a.get("space") and a.get("chat") and a.get("title") == "Halo Testbereich" and not a.get("ownShown") and a.get("mask")
              and a.get("heights") == before and a.get("tab") and a.get("url") and a.get("pageTitle") == "Testbereich"
              and a.get("current") and not a.get("today") and not a["afterMail"]["current"]
              and wb.get("title") == "127.0.0.1" and wb.get("mask") and wb.get("tab") and wb.get("group") == "single-site"
              and wb.get("current") and not wb.get("today") and wb.get("reused") == 1
              and bk.get("chat") and bk.get("title") != "Halo Testbereich" and bk.get("heights") == before and not bk.get("extra")
              and res.get("validate") == [True, True, True, "https://kalender.example.com/"] and res.get("listed") == ["Halo Testbereich"])
        return ok, f"{res}"
    check("Bereichsleiste: fünfter Bereich wahlweise keiner (übrige Knöpfe gleich groß), Bereich einer Erweiterung 1:1 oder feste Webseite auf dem Platz des Chats", fifth_space, results)

    def system_integration_check():
        # der Dialog sperrt per CSP alle Bilder außer chrome: – Haken muss trotzdem erscheinen
        res = m.js('''
          const dlg = w.openDialog("chrome://messenger/content/systemIntegrationDialog.xhtml", "_blank", "chrome,dialog=no,centerscreen");
          await wait(2000);
          const box = dlg.document.getElementById("checkMail"); box.checked = true; await wait(600);
          const cs = dlg.getComputedStyle(box.querySelector(".checkbox-check"));
          const iw = dlg.windowGlobalChild.innerWindowId;
          const blocked = (Services.console.getMessageArray() || []).filter(x => x instanceof Ci.nsIScriptError
            && x.innerWindowID == iw && /Content-Security-Policy/.test(x.errorMessage)).length;
          const out = { img: cs.backgroundImage.slice(0, 40), fill: cs.fill, bg: cs.backgroundColor, blocked };
          dlg.close(); await wait(300);
          return out;''')
        ok = res["img"].startswith('url("chrome:') and res["fill"] == "rgb(255, 255, 255)" and res["blocked"] == 0
        return ok, f"{res}"
    check("Standardprogramm-Dialog: Haken im Kästchen trotz Bildsperre", system_integration_check, results)

    def search_prefs():
        res = m.js('''
          return { gloda: Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled"),
                   list: Services.prefs.getBoolPref("gloda.show_as_list_by_default"),
                   applied: Services.prefs.getBoolPref("extensions.mailcards.searchApplied", false) };''')
        return all(res.values()), f"{res}"
    check("Suche: alle Konten und einfache Liste voreingestellt", search_prefs, results)

    def search_date():
        # Datum im Suchbegriff ohne Jahr: letztes vergangenes Vorkommen, auch
        # für den 29.2. („jetzt“ im Experiment-Modul kurz umgestellt)
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const sd = Cu.evalInSandbox("searchDate", g);
          const p = n => String(n).padStart(2, "0");
          const f = x => x ? `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}` : "-";
          const out = {};
          for (const [now, terms] of [["2026, 9, 20, 15", ["29.2", "12.10", "21.10", "31.4", "29.2.2026", "1.3.25"]], ["2028, 0, 15, 12", ["29.2"]]]) {
            Cu.evalInSandbox(`globalThis.__mcRealDate = Date; Date = class extends __mcRealDate { constructor(...a) { if (a.length) super(...a); else super(${now}); } };`, g);
            try {
              for (const t of terms) out[`${now.split(",")[0]}: ${t}`] = f(sd(t));
            } finally {
              Cu.evalInSandbox("Date = globalThis.__mcRealDate; delete globalThis.__mcRealDate;", g);
            }
          }
          return out;''' % ADDON_ID)
        expected = {"2026: 29.2": "29.02.2024", "2026: 12.10": "12.10.2026", "2026: 21.10": "21.10.2025", "2026: 31.4": "-",
                    "2026: 29.2.2026": "-", "2026: 1.3.25": "01.03.2025", "2028: 29.2": "29.02.2024"}
        bad = [f"„{k}“ → {res.get(k)}" for k, v in expected.items() if res.get(k) != v]
        return not bad, "; ".join(bad) or f"{len(expected)} Suchbegriffe richtig (29.2. ohne Jahr, ungültige Tage)"
    check("Suche: Datum ohne Jahr („29.2“) findet das letzte Vorkommen", search_date, results)

    def birthdays():
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { VCardUtils } = ChromeUtils.importESModule("resource:///modules/VCardUtils.sys.mjs");
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const card = VCardUtils.vCardToAbCard("BEGIN:VCARD\\r\\nVERSION:4.0\\r\\nFN:Halo Testkontakt\\r\\nBDAY:1990-03-15\\r\\nEND:VCARD\\r\\n");
          book.addCard(card);
          // Apple (Kontakte/iCloud): Geburtstag ohne Jahr als 1604 mit X-APPLE-OMIT-YEAR
          book.addCard(VCardUtils.vCardToAbCard("BEGIN:VCARD\\r\\nVERSION:3.0\\r\\nFN:Halo Applekontakt\\r\\nBDAY;X-APPLE-OMIT-YEAR=1604:1604-08-15\\r\\nEND:VCARD\\r\\n"));
          // der Kalender wird 3 s nach der Änderung neu gefüllt
          let c = null;
          for (let i = 0; i < 30 && !c; i++) { await wait(500); c = cal.manager.getCalendarById(Services.prefs.getStringPref("extensions.mailcards.birthdayCalendarId", "")); }
          if (!c) return { calendar: false };
          let all = [];
          for (let i = 0; i < 20; i++) {
            await wait(400);
            all = await c.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
            if (all.some(i => /Halo Testkontakt/.test(i.title)) && all.some(i => /Halo Applekontakt/.test(i.title))) break;
          }
          const it = all.find(i => /Halo Testkontakt/.test(i.title));
          const apple = all.find(i => /Halo Applekontakt/.test(i.title));
          return { calendar: true, name: c.name, readOnly: c.readOnly, title: it?.title, yearly: it?.recurrenceInfo?.getRecurrenceItems()[0]?.type, allDay: it?.startDate.isDate,
                   born: it?.getProperty("DESCRIPTION") || null, apple: apple ? { year: apple.startDate.year, desc: apple.getProperty("DESCRIPTION") || null } : null };''')
        ok = res.get("calendar") and res.get("readOnly") and res.get("yearly") == "YEARLY" and res.get("allDay") and "Halo Testkontakt" in (res.get("title") or "") \
            and "1990" in (res.get("born") or "") and res.get("apple") == {"year": 2000, "desc": None}
        return ok, f"{res}"
    check("Geburtstage aus dem Adressbuch als Kalender (Apple ohne Jahr ohne „Geboren 1604“)", birthdays, results)

    def birthdays_toggle():
        # wie Apple Kalender: „Geburtstage“ steht in der Kalenderliste und wird über das Häkchen
        # ein-/ausgeblendet (keine Option mehr auf der Einstellungsseite); die frühere Option
        # „aus“ blendet ihn einmal aus und wird gelöscht
        res = m.js('''
          const PREF = "extensions.mailcards.birthdays";
          const c = await until(() => cal.manager.getCalendarById(Services.prefs.getStringPref("extensions.mailcards.birthdayCalendarId", "")), 15000);
          if (!c) return { calendar: false };
          await toCalendar();
          const composite = cal.view.getCompositeCalendar(w);
          const box = () => d.querySelector(`#calendar-list li[calendar-id="${c.id}"] .calendar-displayed`);
          const shown = () => !!composite.getCalendarById(c.id);
          const out = { name: c.name, row: !!box(), start: [box()?.checked, shown()] };
          box()?.click(); await wait(400);
          out.off = [box()?.checked, shown()];
          box()?.click(); await wait(400);
          out.on = [box()?.checked, shown()];
          Services.prefs.setBoolPref(PREF, false);
          await until(() => !Services.prefs.prefHasUserValue(PREF), 5000); await wait(400);
          out.migrated = [Services.prefs.prefHasUserValue(PREF), box()?.checked, shown(), !!cal.manager.getCalendarById(c.id)];
          composite.addCalendar(c); await wait(300);
          out.back = [box()?.checked, shown()];
          await toMail();
          return out;''')
        ok = (res.get("calendar") is not False and res.get("row") and res.get("start") == [True, True] and res.get("off") == [False, False]
              and res.get("on") == [True, True] and res.get("migrated") == [False, False, False, True] and res.get("back") == [True, True])
        return ok, f"{res}"
    check("Geburtstage: eigener Kalender in der Kalenderliste, Häkchen blendet ein/aus; frühere Option „aus“ blendet ihn einmal aus", birthdays_toggle, results)

    def message_window_bar():
        # eigenes Nachrichtenfenster wie Apple Mail: Knöpfe einzeilig in eigener Zeile ganz oben, darunter Absender,
        # Ordner und Uhrzeit – auch im schmalen Fenster keine zweite Knopfzeile und keine Überlappung
        res = m.js(r"""
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
          let hdr = null;
          for (const f of MailServices.accounts.localFoldersServer.rootFolder.descendants) {
            for (const h of f.messages) if (h.mime2DecodedSubject.includes("Treffen am Donnerstag")) { hdr = h; break; }
            if (hdr) break; }
          if (!hdr) return { mail: false };
          MailUtils.openMessageInNewWindow(hdr);
          const mw = await until(() => [...Services.wm.getEnumerator("mail:messageWindow")].find(x => x.document.readyState == "complete"), 8000);
          const out = {};
          try {
            await wait(2000);
            for (const W of [900, 560]) {
              mw.resizeTo(W, 700); await wait(1000);
              const md = mw.document.getElementById("messageBrowser").contentDocument;
              const r = id => { const b = md.getElementById(id)?.getBoundingClientRect(); return b && b.width ? { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) } : null; };
              const btns = [...md.querySelectorAll("#header-view-toolbar > toolbarbutton, #header-view-toolbar toolbarbutton")].filter(b => b.getBoundingClientRect().width);
              out[W] = { std: md.documentElement.hasAttribute("mc-standalone"), bar: r("header-view-toolbar"), sender: r("headerSenderToolbarContainer"), meta: r("mcHdrMeta"),
                         rows: new Set(btns.map(b => { const q = b.getBoundingClientRect(); return Math.round((q.top + q.height / 2) / 12); })).size, inside: btns.every(b => b.getBoundingClientRect().right <= mw.innerWidth) };
            }
          } finally { mw.close(); }
          await wait(300);
          return out;""")
        if res.get("mail") is False:
            return False, "Testmail fehlt"
        bad = []
        for W in ("900", "560"):
            v = res.get(W) or {}
            b, snd, mt = v.get("bar") or {}, v.get("sender") or {}, v.get("meta") or {}
            if not (v.get("std") and v.get("rows") == 1 and v.get("inside") and b and snd and mt
                    and b.get("b", 999) <= snd.get("t", 0) and b.get("b", 999) <= mt.get("t", 0)):
                bad.append(f"{W}: {v}")
        return not bad, "; ".join(bad) or f"{res}"
    check("Nachrichtenfenster: Knöpfe einzeilig in eigener Zeile über Absender, Ordner und Uhrzeit (wie Apple Mail), auch schmal", message_window_bar, results)

    def calendar_list_light():
        # Kalenderliste wie Apple Kalender: angehakt gefüllt in der Kalenderfarbe, Haken in Thunderbirds Kontrastfarbe
        # (helle Farbe → dunkler Haken); nicht angehakt leeres Kästchen mit Rand in der Kalenderfarbe
        res = m.js(r"""
          const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = "Halo Hell";
          c.setProperty("color", "#DCEBFB"); cal.manager.registerCalendar(c);
          await toCalendar(); await wait(600);
          const li = await until(() => d.querySelector(`#calendar-list li[calendar-id="${c.id}"]`), 4000);
          const box = li?.querySelector(".calendar-color"), input = li?.querySelector("input.calendar-displayed");
          const lum = s => { const v = s.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 10) / 10; };
          const look = () => { const cs = w.getComputedStyle(box), af = w.getComputedStyle(box, "::after");
            return { bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth, check: af.content != "none" ? af.backgroundColor : null, op: cs.opacity }; };
          const out = { row: !!li };
          if (box) {
            out.on = look(); out.on.contrast = out.on.check ? ratio(out.on.check, out.on.bg) : 0;
            input.click(); await wait(400);
            out.off = look();
            input.click(); await wait(300);
          }
          cal.manager.unregisterCalendar(c); cal.manager.removeCalendar?.(c);
          await toMail();
          return out;""")
        on, off = res.get("on") or {}, res.get("off") or {}
        light = "rgb(220, 235, 251)"
        ok = (res.get("row") and on.get("bg") == light and on.get("contrast", 0) >= 4.5
              and off.get("check") is None and off.get("bg") in ("rgba(0, 0, 0, 0)", "transparent") and off.get("border") == light
              and off.get("op") == "1")
        return ok, f"{res}"
    check("Kalenderliste: helle Kalenderfarbe mit dunklem Haken, nicht angehakt leeres Kästchen mit farbigem Rand (wie Apple Kalender)", calendar_list_light, results)

    def mac_photos_off():
        # Einstellungsseite (setSetting) direkt über das Experiment-Modul; den
        # Abgleich mit den macOS-Kontakten (osascript, echte Kontakte) dabei abklemmen
        res = m.js('''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const MP = Cu.evalInSandbox("MacPhotos", g); const api = Cu.evalInSandbox("mailCards.prototype.getAPI({})", g).mailCards;
          const PREF = "extensions.mailcards.macContactPhotos"; const dir = PathUtils.join(PathUtils.profileDir, "mail-cards-photos");
          const sync = MP.sync; MP.sync = async () => {};
          try {
            // schon einmal eingerichtet: index.json vorhanden, Pref ohne Wert
            await IOUtils.makeDirectory(dir, { ignoreExisting: true }); await IOUtils.writeUTF8(PathUtils.join(dir, "index.json"), "[]");
            Services.prefs.clearUserPref(PREF);
            const before = (await api.getSettings()).macContactPhotos;
            await api.setSetting("macContactPhotos", false);
            return { before, hasValue: Services.prefs.prefHasUserValue(PREF), enabled: await MP.enabled(), shown: (await api.getSettings()).macContactPhotos };
          } finally {
            await IOUtils.remove(dir, { recursive: true }).catch(() => {}); Services.prefs.clearUserPref(PREF); MP.sync = sync;
          }''' % ADDON_ID)
        ok = res["before"] is True and res["hasValue"] and res["enabled"] is False and res["shown"] is False
        return ok, f"{res}"
    check("Kontaktfotos: Ausschalten auf der Einstellungsseite bleibt aus (trotz vorhandener Fotoliste)", mac_photos_off, results)

    def local_ab_photo():
        # Foto im lokalen Adressbuch liegt als Datei in <Profil>/Photos (file:-Adresse)
        res = m.js('''
          const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
          const canvas = d.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); canvas.width = canvas.height = 64;
          const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = "#c33"; ctx.beginPath(); ctx.arc(32, 32, 22, 0, 7); ctx.fill();
          const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg"));
          await IOUtils.makeDirectory(PathUtils.join(PathUtils.profileDir, "Photos"), { ignoreExisting: true });
          await IOUtils.write(PathUtils.join(PathUtils.profileDir, "Photos", "halo-foto.jpg"), new Uint8Array(await blob.arrayBuffer()));
          // zu große Fotodatei (über 2 MB): nicht abgeschnitten verwenden
          const big = new Uint8Array(2.5 * 1024 * 1024); big.set([0xFF, 0xD8, 0xFF, 0xE0]);
          await IOUtils.write(PathUtils.join(PathUtils.profileDir, "Photos", "halo-gross.jpg"), big);
          const book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
          const newCard = (name, email, photo) => { const c = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
            c.displayName = name; c.primaryEmail = email; c.setProperty("PhotoName", photo); return book.addCard(c); };
          const card = newCard("Fiona Foto", "fiona.foto@example.invalid", "halo-foto.jpg");
          const bigCard = newCard("Gustav Gross", "gustav.gross@example.invalid", "halo-gross.jpg");
          try {
            const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
            const enh = Cu.evalInSandbox("enhancer", ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global);
            const bigSrc = await enh.avatars.fromAddressBook("gustav.gross@example.invalid");
            try { MailServices.accounts.localFoldersServer; } catch { MailServices.accounts.createLocalMailAccount(); await wait(500); }
            const root = MailServices.accounts.localFoldersServer.rootFolder;
            if (!root.containsChildNamed("Fotos")) { root.createSubfolder("Fotos", null); await wait(800); }
            const f = root.getChildNamed("Fotos");
            f.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage("From - Sat Oct 17 10:00:00 2026\\r\\nFrom: Fiona Foto <fiona.foto@example.invalid>\\r\\nSubject: Halo Foto\\r\\nDate: Sat, 17 Oct 2026 10:00:00 +0200\\r\\nMessage-ID: <halo-foto@example.invalid>\\r\\n\\r\\nTest\\r\\n");
            const a3 = await toMail(); a3.displayFolder(f.URI);
            const img = await until(() => a3.document.querySelector('#threadTree tr[is="thread-card"] .mc-avatar img[src^="data:"]'), 10000);
            const av = a3.document.querySelector('#threadTree tr[is="thread-card"] .mc-avatar');
            return { photoURL: card.photoURL.slice(0, 8), img: !!img, avatar: av ? (av.querySelector("img")?.getAttribute("src") || "").slice(0, 16) || av.textContent : null,
                     big: bigSrc ? bigSrc.length : null, visibility: d.visibilityState, rows: a3.gDBView?.rowCount };
          } finally {
            book.deleteCards([card, bigCard]);
          }''' % ADDON_ID)
        # ohne gezeichnete Karten (verdecktes Testfenster) lässt sich das Bild nicht prüfen
        if not res["img"] and res.get("visibility") == "hidden":
            return res["big"] is None, f"Testfenster verdeckt (Karten nicht gezeichnet) – Mailliste übersprungen {res}"
        ok = res["photoURL"].startswith("file:") and res["img"] and res["big"] is None
        return ok, f"{res}"
    check("Kontaktfotos: Foto aus dem lokalen Adressbuch (Datei im Profil) in der Mailliste", local_ab_photo, results)

    def net_guard():
        # Absenderbilder kommen von Adressen, die der Absender bestimmt (BIMI,
        # Startseite): eine Umleitung ins lokale Netz darf gar nicht erst
        # verbunden werden; Zeitlimit und Größengrenze gelten für die ganze
        # Antwort. Lokaler Server unter einem öffentlichen Namen (localDomains)
        if not OPENSSL:
            return True, "kein openssl – übersprungen"
        host = "halo-netz.example.org"
        port, der, hits, posts, close = local_https(host)
        try:
            res = m.js('''
              const HOST = %s, PORT = %d;
              const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
              const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
              const get = Cu.evalInSandbox("fetchWithTimeout", g);
              const cert = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB).constructX509FromBase64(%s);
              const co = Cc["@mozilla.org/security/certoverride;1"].getService(Ci.nsICertOverrideService);
              co.rememberValidityOverride(HOST, PORT, {}, cert, true);
              Services.prefs.setStringPref("network.dns.localDomains", HOST);
              const run = async (path, opts) => {
                const t = Date.now();
                try {
                  const r = await get(w, `https://${HOST}:${PORT}${path}`, opts);
                  const text = await r.text();
                  return { ok: r.ok, status: r.status, url: r.url, len: text.length, text: text.slice(-5), ms: Date.now() - t };
                } catch (e) { return { error: String(e?.message || e), ms: Date.now() - t }; }
              };
              try {
                return { redirect: await run("/umleitung"), follow: await run("/weiter"), auth: await run("/anmelden"),
                         endless: await run("/endlos", { max: 512 * 1024 }), head: await run("/endlos", { max: 200000, truncate: true }),
                         stall: await run("/stumm"),
                         post: await run("/abmelden", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
                                                        body: "List-Unsubscribe=One-Click", max: 0, truncate: true }),
                         postRedirect: await run("/abmelden-umleitung", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
                                                        body: "List-Unsubscribe=One-Click", max: 0, truncate: true, followRedirects: false }) };
              } finally {
                co.clearValidityOverride(HOST, PORT, {});
                Services.prefs.clearUserPref("network.dns.localDomains");
              }''' % (json.dumps(host), port, ADDON_ID, json.dumps(der)))
        finally:
            close()
        res["device"], res["posts"] = hits, posts
        ok = (res["redirect"].get("error") == "blocked redirect" and not hits
              and res["follow"].get("ok") and res["follow"].get("url", "").endswith("/ziel") and res["follow"].get("text") == "Grüße"
              and res["auth"].get("status") == 401
              and res["endless"].get("error") == "too large" and res["head"].get("len") == 200000
              and res["stall"].get("error") == "timeout" and res["stall"]["ms"] < 15000
              and res["post"].get("ok") and res["postRedirect"].get("ok") and res["postRedirect"].get("status") == 303
              and posts == ["List-Unsubscribe=One-Click"] * 2)
        return ok, f"{res}"
    check("Absenderbilder: Umleitung ins lokale Netz gesperrt, bevor verbunden wird; Zeitlimit und Größengrenze für die ganze Antwort; Ein-Klick-Abmeldung mit Umleitung gilt als erledigt", net_guard, results)

    def unsubscribed_hides_button():
        # Ein-Klick-Abmeldung bestätigt (POST 200 vom lokalen Testserver): Knopf verschwindet, Hinweis sagt es – auch bei
        # einer weiteren Mail desselben Verteilers
        if not OPENSSL:
            return True, "kein openssl – übersprungen"
        host = "halo-abmelden.example.org"
        port, der, hits, posts, close = local_https(host)
        try:
            m.js(r"""
              const HOST = %s, PORT = %d;
              const cert = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB).constructX509FromBase64(%s);
              Cc["@mozilla.org/security/certoverride;1"].getService(Ci.nsICertOverrideService).rememberValidityOverride(HOST, PORT, {}, cert, true);
              Services.prefs.setStringPref("network.dns.localDomains", HOST);
              const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
              const root = MailServices.accounts.localFoldersServer.rootFolder;
              if (!root.containsChildNamed("Abbestellt")) { root.createSubfolder("Abbestellt", null); await wait(800); }
              const f = root.getChildNamed("Abbestellt").QueryInterface(Ci.nsIMsgLocalMailFolder);
              for (const n of [1, 2]) f.addMessage(`From - Sat Oct 17 10:00:00 2026\r\nFrom: Rundbrief <news@example.invalid>\r\nSubject: Halo Rundbrief ${n}\r\nDate: Sat, 17 Oct 2026 0${n}:41:00 +0200\r\nMessage-ID: <halo-abbestellt-${n}@example.invalid>\r\nList-Unsubscribe: <https://${HOST}:${PORT}/abmelden>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nList-Id: <rundbrief.example.invalid>\r\n\r\nTest\r\n`);
              await wait(800);
              const a3 = await toMail(); a3.displayFolder(f.URI); await wait(900);
              a3.threadTree.selectedIndex = 0; await wait(1800);
              await until(() => a3.messageBrowser.contentDocument.querySelector("#mcListBanner .mc-lb-unsub"), 4000);
              a3.messageBrowser.contentDocument.querySelector("#mcListBanner .mc-lb-unsub").click();
              return 1;""" % (json.dumps(host), port, json.dumps(der)))
            for _ in range(20):
                try:
                    m.cmd("WebDriver:AcceptAlert", {})
                    break
                except RuntimeError:
                    time.sleep(0.25)
            res = m.js(r"""
              const a3 = await toMail(); const md = () => a3.messageBrowser.contentDocument;
              await until(() => !md().querySelector("#mcListBanner .mc-lb-unsub"), 5000);
              const show = () => ({ banner: !!md().getElementById("mcListBanner"), button: !!md().querySelector("#mcListBanner .mc-lb-unsub"),
                                    text: md().querySelector("#mcListBanner .mc-lb-text")?.textContent, subject: a3.gDBView?.hdrForFirstSelectedMessage?.subject });
              const out = { after: show() };
              a3.threadTree.selectedIndex = 1; await wait(1800); out.other = show();
              out.pref = Services.prefs.getStringPref("extensions.mailcards.unsubscribedLists", "");
              Services.prefs.clearUserPref("extensions.mailcards.unsubscribedLists");
              Services.prefs.clearUserPref("network.dns.localDomains");
              return out;""")
        finally:
            close()
        res["posts"] = posts
        a, o = res["after"], res["other"]
        ok = (posts == ["List-Unsubscribe=One-Click"] and a["banner"] and not a["button"] and "unsubscribed" in (a["text"] or "")
              and o["banner"] and not o["button"] and a["subject"] != o["subject"] and "list:rundbrief.example.invalid" in res["pref"])
        return ok, f"{res}"
    check("Verteiler-Hinweis: nach erfolgreicher Ein-Klick-Abmeldung kein Abmelden-Knopf mehr, auch bei weiteren Mails des Verteilers", unsubscribed_hides_button, results)

    def keyboard():
        # (Fokusring zeigt macOS nur im aktiven Fenster – nach geschlossenen Nebenfenstern das Hauptfenster nach vorn holen)
        res = m.js('''
          await toMail(); w.focus(); await until(() => Services.focus.activeWindow == w, 3000); await wait(300);
          const ring = el => { el.focus({ focusVisible: true }); const cs = getComputedStyle(el); const r = cs.outlineStyle != "none" && parseFloat(cs.outlineWidth) >= 2; el.blur(); return r; };
          const own = ["mcSpacesToggle", "mcTodayToggle"].map(id => d.getElementById(id)).filter(Boolean);
          const unlabeled = own.filter(b => !b.getAttribute("aria-label")).map(b => b.id);
          const rings = own.filter(b => !ring(b)).map(b => b.id);
          const a3 = d.getElementById("tabmail").currentAbout3Pane;
          const acts = [...(a3?.messageBrowser?.contentDocument?.querySelectorAll(".mc-hover-action") || [])];
          return { own: own.length, unlabeled, noRing: rings, actions: acts.length, tabbable: acts.filter(b => b.tabIndex >= 0).length,
                   actionsLabeled: acts.every(b => b.getAttribute("aria-label")) };''')
        ok = res["own"] == 2 and not res["unlabeled"] and not res["noRing"] and res["tabbable"] == 0 and res["actionsLabeled"]
        return ok, f"{res}"
    check("Tastatur: Fokusring und Beschriftung eigener Knöpfe", keyboard, results)

    def auto_update():
        res = m.js('''
          const last = await until(() => Services.prefs.getIntPref("extensions.mailcards.autoUpdateLast", 0), 25000);
          // seit dem Start dieses Thunderbird-Prozesses (statt fester 10 Minuten: unter Last dauert der Lauf länger)
          const start = Math.floor(Services.startup.getStartupInfo().process / 1000);
          return { last, ageSec: last ? Math.round(Date.now() / 1000 - last) : null, sinceStart: last ? last - start : null };''')
        return bool(res["last"]) and res["sinceStart"] is not None and res["sinceStart"] >= -5, f"Update-Prüfung beim Start gelaufen: {res}"
    check("Updates: Prüfung beim Start", auto_update, results)

    ENH_JS = '''
          const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
          const g = ExtensionParent.GlobalManager.getExtension("%s").experimentAPIManager.global;
          const enh = Cu.evalInSandbox("enhancer", g);
          const openBooks = async () => { tm.openTab("addressBookTab", {});
            return until(() => { const c = tm.currentTabInfo?.browser?.contentWindow; return c?.document?.getElementById("mcBooksHeader") && c; }, 8000); };''' % ADDON_ID

    def window_callbacks():
        # Seitenleisten-Tooltip, Popover „Neu“ und Today-Pane-Sync gehören dem Fenster, nicht dem gemeinsamen Enhancer
        res = m.js(ENH_JS + '''
          await toMail();
          return { onEnhancer: ["openNewPopupAbove", "openNewPopupBelow", "lastNewAnchor", "todayTopSync", "sidebarTip", "sideHidden", "toggleSpaceSidebar"].filter(k => k in enh),
                   sync: typeof w.__mcTodayTopSync };''')
        return not res["onEnhancer"] and res["sync"] == "function", f"{res}"
    check("Erweiterung: Fenster-Callbacks je Hauptfenster statt am gemeinsamen Enhancer", window_callbacks, results)

    def books_leak():
        # Restorer eines geschlossenen Adressbuch-Tabs werden verworfen (halten das Fenster nicht fest);
        # nach dem ersten Öffnen (einmalige Hooks) wächst die Liste aller Restorer je Öffnen und Schließen nicht mehr
        res = m.js(ENH_JS + '''
          const cw = await openBooks();
          const fns = cw ? [...(enh.winRestorers.get(cw) || [])] : [];
          const held = fns.filter(f => enh.restorers.includes(f)).length;
          tm.closeTab(tm.currentTabInfo);
          const freed = await until(() => fns.every(f => !enh.restorers.includes(f)), 6000);
          await toMail(); await wait(800);
          const n1 = enh.restorers.length;
          const cw2 = await openBooks(); await wait(800);
          const open2 = enh.restorers.length;
          tm.closeTab(tm.currentTabInfo); await toMail();
          const n2 = await until(() => enh.restorers.length == n1 && n1, 6000) || enh.restorers.length;
          return { tab: !!cw && !!cw2, fns: fns.length, held, freed, n1, open2, n2 };''')
        ok = res["tab"] and res["fns"] > 0 and res["held"] == res["fns"] and res["freed"] and res["n2"] == res["n1"]
        return ok, f"{res}"
    check("Erweiterung: Restorer geschlossener Adressbuch-Tabs werden verworfen", books_leak, results)

    def restart_cycle():
        # wie bei einem Update: stop() räumt auf (Breiten-Merkmal, Adressbuch-Überschrift, Ordnernamen),
        # ein neuer Start hängt alles wieder an
        res = m.js(ENH_JS + '''
          await toMail();
          const ad = tm.currentAbout3Pane.document;
          const fp = ad.getElementById("folderPane");
          const local = () => ad.querySelector('#folderTree > li[data-mode="all"] li[is="folder-tree-row"][data-server-type="none"]');
          const nameOf = li => li?.querySelector(":scope > .container .name")?.textContent;
          const cw = await openBooks();
          const out = { tab: !!cw, watch0: !!fp.__mcWidthWatch, local0: nameOf(local()) };
          enh.stop();
          out.watch1 = !!fp.__mcWidthWatch;
          // wie nach 3.2.0: deren stop() ließ das Merkmal als „true“ stehen
          fp.__mcWidthWatch = true;
          out.header1 = !!cw?.document.getElementById("mcBooksHeader");
          // Überschrift einer älteren Fassung (ohne Kennung) bleibt stehen: wird ersetzt
          if (cw) { const old = cw.document.createElement("div"); old.id = "mcBooksHeader"; cw.document.getElementById("books")?.before(old); }
          out.local1 = nameOf(local()); out.server = local()?._serverName;
          Cu.evalInSandbox("enhancer = new CardEnhancer({}); enhancer.start();", g);
          const owner = Cu.evalInSandbox("HOOK_OWNER", g);
          out.header2 = !!(await until(() => cw?.document.getElementById("mcBooksHeader")?.__mcOwner === owner, 8000));
          out.headers2 = cw ? cw.document.querySelectorAll("#mcBooksHeader").length : 0;
          out.watch2 = await until(() => typeof fp.__mcWidthWatch == "object", 8000);
          out.local2 = await until(() => nameOf(local()) == out.local0 && out.local0, 6000);
          tm.closeTab(tm.currentTabInfo); await toMail();
          return out;''')
        ok = (res["tab"] and res["watch0"] and not res["watch1"] and res["watch2"] and not res["header1"] and res["header2"] and res["headers2"] == 1
              and res["local0"] != res["server"] and res["local1"] == res["server"] and res["local2"])
        return ok, f"{res}"
    check("Erweiterung: Aus- und Einschalten setzt Ordnernamen und Einfügungen zurück und hängt sie wieder an; Einfügungen einer älteren Fassung werden ersetzt", restart_cycle, results)

    def send_progress():
        # kein Fortschrittsfenster beim Senden; Ausschalten stellt den vorherigen
        # Wert her (Standard bzw. vom Nutzer abgeschaltet), Einschalten setzt wieder aus
        res = m.js(ENH_JS + '''
          const P = "mailnews.show_send_progress", S = "extensions.mailcards.sendProgressSaved";
          const restart = () => Cu.evalInSandbox("enhancer = new CardEnhancer({}); enhancer.start();", g);
          const out = { on: Services.prefs.getBoolPref(P) };
          enh.stop();
          out.off = { value: Services.prefs.getBoolPref(P), user: Services.prefs.prefHasUserValue(P), saved: Services.prefs.prefHasUserValue(S) };
          // vom Nutzer abgeschaltet: bleibt nach dem Ausschalten aus
          Services.prefs.setBoolPref(P, false);
          restart();
          out.on2 = Services.prefs.getBoolPref(P);
          Cu.evalInSandbox("enhancer", g).stop();
          out.off2 = Services.prefs.getBoolPref(P);
          Services.prefs.clearUserPref(P);
          restart();
          out.on3 = Services.prefs.getBoolPref(P);
          // Senden im Hintergrund wie Apple Mail (Fenster schließt sofort), Fehler als eigener Dialog
          const B = "mailnews.sendInBackground";
          const e3 = Cu.evalInSandbox("enhancer", g);
          out.bg = Services.prefs.getBoolPref(B);
          const seen = [];
          e3.showSendError = async (hdr, message) => seen.push(message);
          e3.sendErrorListener?.onMessageSendError(1, null, 0x80004005, "Testfehler");
          out.seen = seen;
          delete e3.showSendError;
          e3.stop();
          out.bgOff = { value: Services.prefs.getBoolPref(B), user: Services.prefs.prefHasUserValue(B) };
          restart();
          out.bg2 = Services.prefs.getBoolPref(B);
          await toMail();
          return out;''')
        ok = (res["on"] is False and res["off"] == {"value": True, "user": False, "saved": False}
              and res["on2"] is False and res["off2"] is False and res["on3"] is False
              and res["bg"] is True and res["seen"] == ["Testfehler"] and res["bgOff"] == {"value": False, "user": False} and res["bg2"] is True)
        return ok, f"{res}"
    check("Verfassen: kein Fortschrittsfenster, Senden im Hintergrund mit eigener Fehlermeldung; Ausschalten stellt die vorherigen Werte wieder her", send_progress, results)

    def local_collapse():
        # „Auf meinem Mac“ klappt auch nach einer Suche zu: der eigene Suchordner
        # (mit Trefferzahl) zählt nicht als Inhalt, ein Ordner mit Mails schon
        res = m.js(ENH_JS + '''
          const sf = enh.searchFolder(true);
          const empty = { hasSubFolders: false, getTotalMessages: () => 0 };
          const full = { hasSubFolders: false, getTotalMessages: () => 3 };
          // gleicher Name, aber kein eigener Suchordner: zählt mit Trefferzahl
          const foreign = { name: sf?.name, hasSubFolders: false, getTotalMessages: () => 3, getFlag: () => true, parent: sf?.parent, server: null };
          const root = subFolders => ({ subFolders });
          // Suchordner mit Treffern (wie nach einer Suche): als eigener Suchordner erkannt
          const hits = { hasSubFolders: false, getTotalMessages: () => 5 };
          const own = enh.isSearchFolder;
          enh.isSearchFolder = f => f === hits || own.call(enh, f);
          try {
            return { search: own.call(enh, sf), onlySearch: enh.localIsEmpty(root([sf, empty])), withHits: enh.localIsEmpty(root([hits, empty])),
                     withMail: enh.localIsEmpty(root([sf, hits, empty, full])), foreign: enh.localIsEmpty(root([foreign, empty])) };
          } finally {
            delete enh.isSearchFolder;
          }''')
        ok = res["search"] and res["onlySearch"] is True and res["withHits"] is True and res["withMail"] is False and res["foreign"] is False
        return ok, f"{res}"
    check("Ordnerliste: „Auf meinem Mac“ klappt trotz Suchordner mit Treffern zu, mit eigenen Mails nicht", local_collapse, results)

    server_checks(m, results)

    def errors():
        res = m.js("""
          const p = PathUtils.join(PathUtils.profileDir, "mail-cards-debug.log");
          let lines = []; try { lines = (await IOUtils.readUTF8(p)).split("\\n"); } catch {}
          return lines.filter(l => /error|fehler/i.test(l) && !/preview stats/.test(l)).slice(0, 5);""")
        return not res, "; ".join(res) or "keine Fehler im Protokoll"
    check("Fehlerprotokoll der Erweiterung leer", errors, results)


if __name__ == "__main__":
    main()
