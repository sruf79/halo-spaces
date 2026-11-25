// halo_test.py räumt auch bei SIGTERM und SIGHUP auf (pkill, Zeitgrenze eines Werkzeugs, beendete Sitzung): Thunderbird
// beenden, Testprofil löschen, Exitcode 128 + Signal. Vorfall 24./25.11.2026: ohne Signal-Abfang starb Python sofort, der
// Test-Thunderbird lief unter launchd weiter und hielt den Nachtlauf auf. Statt Thunderbird startet hier ein kleines
// Python-Programm, das nur den Anfang von Marionette spricht und sich beim ersten Befehl (Beenden) schließt.
// Läuft ohne Thunderbird unter macOS und Linux (CI, Job statisch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FAKE_TB = `#!/usr/bin/env python3
import json, os, re, socket, sys
prof = sys.argv[sys.argv.index("-profile") + 1]
port = int(re.search(r'"marionette.port", (\\d+)', open(os.path.join(prof, "user.js")).read()).group(1))
info = os.environ["FAKE_TB_INFO"]
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", port))
s.listen(5)
with open(info + ".neu", "w") as f:
    f.write(f"{os.getpid()}\\n{prof}\\n")
os.replace(info + ".neu", info)
hallo = json.dumps({"applicationType": "gecko", "marionetteProtocol": 3}).encode()
while True:
    c, _ = s.accept()
    try:
        c.sendall(str(len(hallo)).encode() + b":" + hallo)
        if c.recv(1):  # erster Befehl (beim Aufräumen: Beenden): schließen wie Thunderbird nach dem Beenden
            open(info + ".beendet", "w").write("ja")
            os._exit(0)
    except OSError:
        pass  # wait_port() verbindet nur und schließt gleich wieder
    c.close()
`;

function freierPort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

const lebt = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function lauf(signal) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "halo-signal-"));
  const T = path.join(tmp, "T");
  fs.mkdirSync(T);
  const xpi = path.join(tmp, "paket.xpi");
  execFileSync("python3", ["-I", "-c",
    "import sys, zipfile; zipfile.ZipFile(sys.argv[1], 'w').writestr('manifest.json', '{\"version\": \"1.0.0\"}')", xpi]);
  const tb = path.join(tmp, "thunderbird");
  fs.writeFileSync(tb, FAKE_TB, { mode: 0o755 });
  const info = path.join(tmp, "info");
  const port = await freierPort();
  const kind = spawn("python3", ["-u", path.join(ROOT, "tests", "halo_test.py"), "--xpi", xpi, "--tb", tb, "--port", String(port),
    "--ohne-vergleich"], { env: { ...process.env, TMPDIR: T, FAKE_TB_INFO: info }, stdio: ["ignore", "pipe", "pipe"] });
  let aus = "";
  kind.stdout.on("data", (d) => { aus += d; });
  kind.stderr.on("data", (d) => { aus += d; });
  const ende = new Promise((resolve) => kind.on("exit", (code, sig) => resolve({ code, sig })));
  try {
    // bis das Ersatz-Thunderbird läuft (unter macOS wartet halo_test.py evtl. kurz auf einen Lauf in der Windows-VM)
    const bis = Date.now() + 120000;
    while (!fs.existsSync(info) && Date.now() < bis && kind.exitCode === null) await warte(100);
    assert.ok(fs.existsSync(info), `Ersatz-Thunderbird nicht gestartet. Ausgabe:\n${aus}`);
    const [pid, profil] = fs.readFileSync(info, "utf8").trim().split("\n");
    assert.ok(path.basename(profil).startsWith("halo-test-") && fs.existsSync(profil), `Profil ${profil} fehlt`);
    await warte(500);  // halo_test.py wartet jetzt auf den Port bzw. auf den Aufbau (time.sleep(8))
    kind.kill(signal);
    let uhr;
    const { code, sig } = await Promise.race([ende, new Promise((r) => { uhr = setTimeout(() => r({ code: "zeit", sig: null }), 60000); })]);
    clearTimeout(uhr);
    const erwartet = 128 + os.constants.signals[signal];
    assert.equal(code, erwartet, `Exitcode ${code} (Signal ${sig}), erwartet ${erwartet}. Ausgabe:\n${aus}`);
    assert.ok(fs.existsSync(info + ".beendet"), `Thunderbird bekam keinen Beenden-Befehl. Ausgabe:\n${aus}`);
    const bisWeg = Date.now() + 5000;
    while (lebt(Number(pid)) && Date.now() < bisWeg) await warte(100);
    assert.ok(!lebt(Number(pid)), `Ersatz-Thunderbird (PID ${pid}) läuft noch`);
    assert.deepEqual(fs.readdirSync(T).filter((n) => n.startsWith("halo-test-")), [], "Testprofil nicht gelöscht");
  } finally {
    if (kind.exitCode === null) kind.kill("SIGKILL");
    if (fs.existsSync(info)) { const pid = Number(fs.readFileSync(info, "utf8").split("\n")[0]); if (lebt(pid)) process.kill(pid, "SIGKILL"); }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("halo_test.py: SIGTERM beendet Thunderbird und löscht das Testprofil (Exitcode 143)", { timeout: 180000 }, () => lauf("SIGTERM"));
test("halo_test.py: SIGHUP beendet Thunderbird und löscht das Testprofil (Exitcode 129)", { timeout: 180000 }, () => lauf("SIGHUP"));
