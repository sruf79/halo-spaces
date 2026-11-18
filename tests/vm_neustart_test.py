#!/usr/bin/env python3
"""Logiktest für die frische Windows-VM (halo_test.py: vm_kaltstart, vm_vorbereiten, vm_frisch, bildtakt_gestoert;
tests/vm-frisch.sh). Ohne VM: eine Attrappe für prlctl im PATH merkt sich den Zustand der VM in einer Datei und
schreibt die Bildzeiten des Kurztests je Start aus FAKE_TAKT in die Freigabe (ebenfalls ein Ordner im Temp).
Die Uhr ist eine Attrappe (sleep stellt sie nur vor), der Test läuft in Sekundenbruchteilen.

Aufruf:  python3 tests/vm_neustart_test.py     (eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg)
"""
import contextlib
import importlib.util
import io
import os
import stat
import subprocess
import sys
import tempfile
import time
import types

HIER = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("halo_test", os.path.join(HIER, "halo_test.py"))
ht = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ht)

ATTRAPPE = r'''#!/usr/bin/env python3
import os, sys
d = os.environ["FAKE_DIR"]
def lies(n, std=""):
    try: return open(os.path.join(d, n)).read().strip()
    except OSError: return std
def schreib(n, v): open(os.path.join(d, n), "w").write(v)
a = sys.argv[1:]
open(os.path.join(d, "log"), "a").write(" ".join(a) + "\n")
zustand = lies("zustand", "running")
if a[0] == "status":
    print(f"VM {a[1]} exist {zustand}")
elif a[0] == "resume":
    schreib("zustand", "running")
elif a[0] == "suspend":
    schreib("zustand", "suspended")
elif a[0] == "stop":
    if "--kill" in a or os.environ.get("FAKE_STOP") != "haengt":
        schreib("zustand", "stopped")
    else:
        sys.exit(1)
elif a[0] == "start":
    schreib("zustand", "running")
    schreib("starts", str(int(lies("starts", "0")) + 1))
elif a[0] == "exec":
    if zustand != "running":
        sys.exit(255)
    if "bereit" in a:
        print("bereit")
    elif any(x.endswith("win-bildtakt.ps1") for x in a):
        aus = a[a.index(next(x for x in a if x.endswith("win-bildtakt.ps1"))) + 1]
        aus = os.path.join(os.environ["FAKE_SHARE"], *aus[len("\\\\Mac\\halo\\"):].split("\\"))
        takt = os.environ.get("FAKE_TAKT", "ok").split(",")
        art = takt[min(int(lies("takt", "0")), len(takt) - 1)]
        schreib("takt", str(int(lies("takt", "0")) + 1))
        zeiten = [16.7] * 30 if art == "ok" else [16.7] * 26 + [150.0] * 4
        open(aus, "w").write(" ".join(map(str, zeiten)))
'''

ergebnisse = []


def check(name, ok, info=""):
    ergebnisse.append(ok)
    print(f"{'OK     ' if ok else 'FEHLER '} {name}" + ("" if ok else f"  ({info})"), flush=True)


def lauf(zustand, env=None, ziel=None, belegt=None):
    """Führt ziel(share) mit frischer Attrappe aus; liefert (Rückgabe oder SystemExit, Ausgabe, prlctl-Befehle, Zustand, share)."""
    d = tempfile.mkdtemp(prefix="vm-attrappe-")
    share = os.path.join(d, "share")
    os.makedirs(os.path.join(share, "lauf-test"))
    p = os.path.join(d, "prlctl")
    open(p, "w").write(ATTRAPPE)
    os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
    open(os.path.join(d, "zustand"), "w").write(zustand)
    alt = dict(os.environ)
    os.environ.update({"PATH": d + os.pathsep + alt["PATH"], "FAKE_DIR": d, "FAKE_SHARE": share, **(env or {})})
    uhr = [1000.0]
    gesichert = (ht.VM_SHARE, ht.VM_LOCK, ht.vm_belegt)
    ht.VM_SHARE, ht.VM_LOCK = share, os.path.join(share, "lauf.lock")
    ht.vm_belegt = lambda: belegt
    ht.time = types.SimpleNamespace(time=lambda: uhr[0], sleep=lambda s: uhr.__setitem__(0, uhr[0] + s),
                                    strftime=time.strftime)
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            try:
                res = ziel(share)
            except SystemExit as e:
                res = e
    finally:
        os.environ.clear()
        os.environ.update(alt)
        ht.time = time
        ht.VM_SHARE, ht.VM_LOCK, ht.vm_belegt = gesichert
    log = open(os.path.join(d, "log")).read().splitlines() if os.path.exists(os.path.join(d, "log")) else []
    return res, out.getvalue(), [z.split()[0] for z in log], open(os.path.join(d, "zustand")).read(), share


VM = "Windows 11"
WIN = r"\\Mac\halo\lauf-test"
vorbereiten = lambda share: ht.vm_vorbereiten(VM, os.path.join(share, "lauf-test"), WIN)

# Bewertung des Kurztests
check("Bildtakt: 30 gleichmäßige Bilder sind nicht gestört", ht.bildtakt_gestoert([16.7] * 30)[0] is False)
check("Bildtakt: 4 von 30 Bildern über 1,6 × Mittel sind gestört", ht.bildtakt_gestoert([16.7] * 26 + [150.0] * 4)[0] is True)
check("Bildtakt: genau 3 lange Bilder sind noch nicht gestört", ht.bildtakt_gestoert([16.7] * 27 + [150.0] * 3)[0] is False)
check("Bildtakt: ohne Messwerte nicht messbar (None, es geht weiter)", ht.bildtakt_gestoert([])[0] is None)

# kalter Neustart
res, out, aufrufe, z, _ = lauf("running", ziel=lambda s: ht.vm_kaltstart(VM))
check("Kaltstart aus laufender VM: stop, dann start, VM läuft", aufrufe.count("stop") == 1 and "start" in aufrufe
      and aufrufe.index("stop") < aufrufe.index("start") and z == "running", f"{aufrufe} {z}")
res, out, aufrufe, z, _ = lauf("suspended", ziel=lambda s: ht.vm_kaltstart(VM))
check("Kaltstart aus pausierter VM: resume, stop, start", aufrufe[:3] == ["status", "resume", "status"]
      and "stop" in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("stopped", ziel=lambda s: ht.vm_kaltstart(VM))
check("Kaltstart aus gestoppter VM: nur start", "stop" not in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_STOP": "haengt"}, ziel=lambda s: ht.vm_kaltstart(VM))
check("Kaltstart: fährt die VM nicht herunter, folgt stop --kill", aufrufe.count("stop") == 2
      and "hart beendet" in out and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("invalid", ziel=lambda s: ht.vm_kaltstart(VM))
check("Kaltstart: unbekannter Zustand bricht mit FEHLER VM gestört ab", isinstance(res, SystemExit)
      and "FEHLER VM gestört" in out, f"{res!r} {out!r}")

# im Lauf: nur fortsetzen und Kurztest, EIN Neustart als Rückfall
res, out, aufrufe, z, _ = lauf("suspended", ziel=vorbereiten)
check("Lauf: VM nur fortgesetzt (kein stop/start), Kurztest gut", not isinstance(res, SystemExit) and "resume" in aufrufe
      and "stop" not in aufrufe and "start" not in aufrufe and "VM Bildtakt: 0 von 30" in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", env={"FAKE_TAKT": "gestoert,ok"}, ziel=vorbereiten)
check("Lauf: Bildtakt gestört, ein kalter Neustart behebt es", not isinstance(res, SystemExit)
      and aufrufe.count("stop") == 1 and aufrufe.count("start") == 1 and "FEHLER" not in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=vorbereiten)
check("Lauf: auch nach dem Neustart gestört, Abbruch FEHLER VM gestört", isinstance(res, SystemExit) and res.code == 1
      and aufrufe.count("start") == 1 and "FEHLER VM gestört" in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", env={"FAKE_TAKT": "gestoert", "HALO_VM_KEIN_NEUSTART": "1"}, ziel=vorbereiten)
check("Lauf mit HALO_VM_KEIN_NEUSTART=1: gestörter Takt nur Hinweis, kein stop/start", not isinstance(res, SystemExit)
      and "stop" not in aufrufe and "start" not in aufrufe and "kein Neustart" in out, f"{aufrufe} {out!r}")

# vm_frisch: kalter Neustart außerhalb eines Laufs
res, out, aufrufe, z, share = lauf("suspended", ziel=lambda s: ht.vm_frisch(VM))
check("vm-frisch: kalter Neustart, Kurztest, danach wieder pausiert, Sperre weg", res == 0 and "stop" in aufrufe
      and "start" in aufrufe and aufrufe[-1] == "suspend" and z == "suspended" and not os.path.exists(os.path.join(share, "lauf.lock"))
      and "VM frisch" in out, f"{res} {aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_TAKT": "gestoert,ok"}, ziel=lambda s: ht.vm_frisch(VM))
check("vm-frisch: Takt gestört, zweiter Neustart, kein Fehler", res == 0 and aufrufe.count("start") == 2, f"{res} {aufrufe}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=lambda s: ht.vm_frisch(VM))
check("vm-frisch: zweimal gestört, FEHLER VM gestört, VM trotzdem pausiert", isinstance(res, SystemExit)
      and "FEHLER VM gestört" in out and z == "suspended", f"{res!r} {aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", belegt="CI-Lauf auf dem GitHub-Runner", ziel=lambda s: ht.vm_frisch(VM))
check("vm-frisch: bei laufender CI sofort ausgelassen (Exitcode 3), VM nicht angefasst", res == 3 and not aufrufe
      and "ÜBERSPRUNGEN vm-frisch: CI-Lauf" in out and z == "suspended", f"{res} {aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", belegt="Testlauf (halo_test.py o. ä.)", ziel=lambda s: ht.vm_frisch(VM, warten=60))
check("vm-frisch: wartet höchstens die Wartezeit, dann ausgelassen", res == 3 and not aufrufe, f"{res} {aufrufe}")
tot = subprocess.Popen(["true"])
tot.wait()
res, out, aufrufe, z, _ = lauf("suspended", ziel=lambda s: ht.vm_frisch(VM, warten=900, nach_pid=tot.pid))
check("vm-frisch nach einem Lauf: Lauf beendet, Neustart folgt", res == 0 and "start" in aufrufe, f"{res} {aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", ziel=lambda s: ht.vm_frisch(VM, warten=60, nach_pid=os.getpid()))
check("vm-frisch nach einem Lauf: Lauf läuft noch, nach der Wartezeit ausgelassen", res == 3 and not aufrufe
      and "noch nicht beendet" in out, f"{res} {aufrufe} {out!r}")

# Dateien für die VM
quelle = open(os.path.join(HIER, "halo_test.py")).read()
check("win-bildtakt.ps1 liegt neben halo_test.py und geht in die VM (Lauf und vm-frisch)",
      os.path.exists(os.path.join(HIER, "win-bildtakt.ps1")) and quelle.count('"win-bildtakt.ps1"') == 2)
check("Lauf mit --vm startet danach den Neustart im Hintergrund (außer --vm-weiter, HALO_VM_KEIN_NEUSTART=1)",
      "vm_frisch_danach(vm)" in quelle and "RUNNER_TRACKING_ID" in quelle)

# tests/vm-frisch.sh: Zeitfenster und Tagesmarke (Befehl ersetzt durch HALO_VM_FRISCH_CMD)
def skript(hm, cmd="true", *opt):
    env = {**os.environ, "HALO_NACHT": nacht, "HALO_JETZT_HM": hm, "HALO_VM_FRISCH_CMD": cmd}
    return subprocess.run(["zsh", os.path.join(HIER, "vm-frisch.sh"), *opt], env=env).returncode


nacht = tempfile.mkdtemp(prefix="vm-frisch-nacht-")
log = os.path.join(nacht, "vm-frisch.log")
skript("0030", "true", "--taeglich")
check("vm-frisch.sh --taeglich: vor 00:45 nichts", not os.path.exists(log))
skript("0120", "true", "--taeglich")
check("vm-frisch.sh --taeglich: ab 01:15 nichts (Nachtlauf 01:30)", not os.path.exists(log))
rc = skript("0050", "python3 -c raise(SystemExit(3))", "--taeglich")
check("vm-frisch.sh --taeglich: belegt (3), Tagesmarke zurückgenommen", rc == 3 and not os.path.exists(os.path.join(nacht, "vm-frisch.tag")))
rc = skript("0100", "true", "--taeglich")
n = open(log).read().count("vm-frisch --taeglich")
skript("0110", "true", "--taeglich")
check("vm-frisch.sh --taeglich: läuft einmal je Tag", rc == 0 and open(log).read().count("vm-frisch --taeglich") == n == 2)

sys.exit(0 if all(ergebnisse) else 1)
