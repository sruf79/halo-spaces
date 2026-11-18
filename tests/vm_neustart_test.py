#!/usr/bin/env python3
"""Logiktest für die frische Windows-VM (tests/vm_frisch.py, tests/vm-frisch.sh, Anbindung in halo_test.py).
Ohne VM: eine Attrappe für prlctl im PATH merkt sich den Zustand der VM in einer Datei und schreibt die Bildzeiten
des Kurztests je Messung aus FAKE_TAKT in die Freigabe (ein Ordner im Temp). Die Uhr ist eine Attrappe (sleep
stellt sie nur vor), der Test läuft in Sekunden.

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
sys.path.insert(0, HIER)


def lade(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HIER, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


vmf = lade("vm_frisch")

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


def lauf(zustand, env=None, ziel=None, belegt=None, lock=None):
    """Führt ziel(share) mit frischer Attrappe aus; liefert (Rückgabe oder SystemExit, Ausgabe, prlctl-Befehle,
    Zustand, share). belegt: Rückgabe von vm_belegt (Wert oder Funktion); lock: Inhalt einer Sperre vorab."""
    d = tempfile.mkdtemp(prefix="vm-attrappe-")
    share = os.path.join(d, "share")
    os.makedirs(os.path.join(share, "lauf-test"))
    p = os.path.join(d, "prlctl")
    open(p, "w").write(ATTRAPPE)
    os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
    open(os.path.join(d, "zustand"), "w").write(zustand)
    if lock:
        open(os.path.join(share, "lauf.lock"), "w").write(lock)
    alt = dict(os.environ)
    os.environ.update({"PATH": d + os.pathsep + alt["PATH"], "FAKE_DIR": d, "FAKE_SHARE": share, **(env or {})})
    uhr = [1000.0]
    gesichert = (vmf.VM_SHARE, vmf.VM_LOCK, vmf.vm_belegt)
    vmf.VM_SHARE, vmf.VM_LOCK = share, os.path.join(share, "lauf.lock")
    vmf.vm_belegt = belegt if callable(belegt) else (lambda: belegt)
    vmf.time = types.SimpleNamespace(time=lambda: uhr[0], sleep=lambda s: uhr.__setitem__(0, uhr[0] + s),
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
        vmf.time = time
        vmf.VM_SHARE, vmf.VM_LOCK, vmf.vm_belegt = gesichert
    log = open(os.path.join(d, "log")).read().splitlines() if os.path.exists(os.path.join(d, "log")) else []
    return res, out.getvalue(), [z.split()[0] for z in log], open(os.path.join(d, "zustand")).read(), share


VM = "Windows 11"
WIN = r"\\Mac\halo\lauf-test"


def vorbereiten(share):
    os.makedirs(os.path.join(share, "lauf-test", "tests"), exist_ok=True)
    return vmf.vm_vorbereiten(VM, os.path.join(share, "lauf-test"), WIN)


lockdatei = lambda share: os.path.join(share, "lauf.lock")
schlaefer = subprocess.Popen(["sleep", "60"])   # ein lebender fremder Prozess
tot = subprocess.Popen(["true"])
tot.wait()                                       # ein beendeter Prozess

# Bewertung des Kurztests
check("Bildtakt: 30 gleichmäßige Bilder sind nicht gestört", vmf.bildtakt_gestoert([16.7] * 30)[0] is False)
check("Bildtakt: 4 von 30 Bildern über 1,6 × Mittel sind gestört", vmf.bildtakt_gestoert([16.7] * 26 + [150.0] * 4)[0] is True)
check("Bildtakt: genau 3 lange Bilder sind noch nicht gestört", vmf.bildtakt_gestoert([16.7] * 27 + [150.0] * 3)[0] is False)
check("Bildtakt: ohne Messwerte nicht messbar (None, es geht weiter)", vmf.bildtakt_gestoert([])[0] is None)

# kalter Neustart
res, out, aufrufe, z, _ = lauf("running", ziel=lambda s: vmf.vm_kaltstart(VM))
check("Kaltstart aus laufender VM: stop, dann start, VM läuft", aufrufe.count("stop") == 1 and "start" in aufrufe
      and aufrufe.index("stop") < aufrufe.index("start") and z == "running", f"{aufrufe} {z}")
res, out, aufrufe, z, _ = lauf("suspended", ziel=lambda s: vmf.vm_kaltstart(VM))
check("Kaltstart aus pausierter VM: resume, stop, start", aufrufe[:3] == ["status", "resume", "status"]
      and "stop" in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("stopped", ziel=lambda s: vmf.vm_kaltstart(VM))
check("Kaltstart aus gestoppter VM: nur start", "stop" not in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_STOP": "haengt"}, ziel=lambda s: vmf.vm_kaltstart(VM))
check("Kaltstart: fährt die VM nicht herunter, folgt stop --kill", aufrufe.count("stop") == 2
      and "hart beendet" in out and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("invalid", ziel=lambda s: vmf.vm_kaltstart(VM))
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

# Sperre
def sperre(share):
    a = vmf.lock_nehmen("eins")
    b = vmf.lock_nehmen("zwei")
    return a, b, vmf.lock_pid()
res, out, aufrufe, z, share = lauf("suspended", ziel=sperre)
check("Sperre: atomar, ein zweiter Versuch scheitert, solange sie lebt", res == (True, False, os.getpid()), f"{res}")
res, out, aufrufe, z, share = lauf("suspended", lock=f"{tot.pid} 2026-11-18 alt\n", ziel=lambda s: (vmf.lock_nehmen("neu"), vmf.lock_pid()))
check("Sperre: verwaiste Sperre (Prozess tot) wird ersetzt", res == (True, os.getpid()), f"{res}")
def uebergabe(share):
    vmf.lock_nehmen("lauf")
    vmf.lock_uebergeben(schlaefer.pid, "vm-frisch nach Lauf")
    vmf.lock_freigeben()   # gehört nicht mehr uns: bleibt
    return vmf.lock_pid()
res, out, aufrufe, z, share = lauf("suspended", ziel=uebergabe)
check("Sperre: Übergabe ohne Lücke, fremde lebende Sperre wird nicht freigegeben", res == schlaefer.pid, f"{res}")

# Neustart-Runde
marke = os.path.join(tempfile.mkdtemp(prefix="vm-marke-"), "vm-frisch.tag")
res, out, aufrufe, z, share = lauf("suspended", ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: kalter Neustart, Kurztest, danach pausiert, Sperre frei, Tagesmarke bei Erfolg", res == 0
      and "stop" in aufrufe and "start" in aufrufe and aufrufe[-1] == "suspend" and z == "suspended"
      and not os.path.exists(lockdatei(share)) and open(marke).read().strip() == time.strftime("%Y-%m-%d"),
      f"{res} {aufrufe} {out!r}")
os.remove(marke)
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_TAKT": "gestoert,ok"}, ziel=lambda s: vmf.frisch(VM))
check("vm-frisch: Takt gestört, zweiter Neustart, kein Fehler", res == 0 and aufrufe.count("start") == 2, f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("running", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: zweimal gestört, FEHLER VM gestört, VM pausiert, Sperre frei, keine Tagesmarke",
      isinstance(res, SystemExit) and "FEHLER VM gestört" in out and z == "suspended"
      and not os.path.exists(lockdatei(share)) and not os.path.exists(marke), f"{res!r} {aufrufe} {out!r}")
res, out, aufrufe, z, share = lauf("suspended", belegt="CI-Lauf auf dem GitHub-Runner", ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: bei laufender CI ausgelassen (3), VM nicht angefasst, keine Sperre, keine Marke", res == 3
      and not [a for a in aufrufe if a != "status"] and not os.path.exists(lockdatei(share)) and not os.path.exists(marke),
      f"{res} {aufrufe} {out!r}")
zaehler = iter([None, "Testlauf (halo_test.py o. ä.)"])
res, out, aufrufe, z, share = lauf("suspended", belegt=lambda: next(zaehler), ziel=lambda s: vmf.frisch(VM))
check("vm-frisch: Test startet zwischen Prüfung und Sperre, Sperre zurückgegeben, ausgelassen", res == 3
      and not os.path.exists(lockdatei(share)) and "stop" not in aufrufe, f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("suspended", lock=f"{schlaefer.pid} 2026-11-18 lauf\n", ziel=lambda s: vmf.frisch(VM, nach_lauf=True))
check("vm-frisch nach Lauf: Sperre eines lebenden Laufs bzw. Neustarts, nichts tun", res == 3 and "stop" not in aufrufe
      and vmf.lock_pid.__name__ and open(lockdatei(share)).read().startswith(str(schlaefer.pid)), f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("suspended", belegt="CI-Lauf auf dem GitHub-Runner", lock=f"{tot.pid} x lauf\n",
                                   ziel=lambda s: vmf.frisch(VM, nach_lauf=True))
check("vm-frisch nach Lauf (Abbruch, verwaiste Sperre): eigener CI-Job zählt nicht, Neustart folgt", res == 0
      and "start" in aufrufe, f"{res} {aufrufe} {out!r}")
res, out, aufrufe, z, share = lauf("suspended", belegt="CI-Lauf auf dem GitHub-Runner", lock=f"{os.getpid()} x übergeben\n",
                                   ziel=lambda s: vmf.frisch(VM, nach_lauf=True, nach_pid=tot.pid))
check("vm-frisch nach Lauf: übergebene Sperre, Lauf beendet, Neustart sofort, Sperre danach frei", res == 0
      and "start" in aufrufe and not os.path.exists(lockdatei(share)), f"{res} {aufrufe} {out!r}")

# gelöst starten (launchd, GitHub-Runner)
gesehen = {}
class FalschPopen:
    def __init__(self, cmd, **kw):
        gesehen.update(kw, cmd=cmd)
        self.pid = 4242
echt = subprocess.Popen
subprocess.Popen = FalschPopen
try:
    vmf.main(["--nach-lauf", "--hintergrund", os.devnull, "--aufraeumen"])
finally:
    subprocess.Popen = echt
check("Hintergrund: eigene Sitzung, RUNNER_TRACKING_ID leer, Argumente ohne --hintergrund weiter",
      gesehen.get("start_new_session") is True and gesehen.get("env", {}).get("RUNNER_TRACKING_ID") == ""
      and gesehen["cmd"][-2:] == ["--nach-lauf", "--aufraeumen"] and "--hintergrund" not in gesehen["cmd"], f"{gesehen}")

# Anbindung in halo_test.py
ht = lade("halo_test")
quelle = open(os.path.join(HIER, "halo_test.py")).read()
check("halo_test.py nutzt tests/vm_frisch.py (Sperre, Kurztest, Rückfall)", ht.vmf is not None
      and ht.vm_vorbereiten.__module__ == "vm_frisch" and "vmf.lock_nehmen" in quelle and "VM_LOCK, \"w\"" not in quelle)
check("win-bildtakt.ps1 geht in die VM (Lauf)", os.path.exists(os.path.join(HIER, "win-bildtakt.ps1")) and '"win-bildtakt.ps1"' in quelle)
def danach(share):
    ht.vmf.VM_SHARE, ht.vmf.VM_LOCK = vmf.VM_SHARE, vmf.VM_LOCK
    ht.vmf.lock_nehmen("lauf")
    alt = ht.vmf.hintergrund
    ht.vmf.hintergrund = lambda argv, log: types.SimpleNamespace(pid=schlaefer.pid, argv=argv)
    try:
        ok = ht.vm_frisch_danach(VM)
    finally:
        ht.vmf.hintergrund = alt
    return ok, ht.vmf.lock_pid()
res, out, aufrufe, z, share = lauf("suspended", ziel=danach)
check("Lauf mit --vm übergibt die Sperre an den Neustart im Hintergrund", res == (True, schlaefer.pid), f"{res} {out!r}")

# tests/vm-frisch.sh: Zeitfenster, Tagesmarke, Modi (Python ersetzt durch eine Attrappe, die die Argumente festhält)
nacht = tempfile.mkdtemp(prefix="vm-frisch-nacht-")
argdatei = os.path.join(nacht, "args")
stub = os.path.join(nacht, "stub.py")
open(stub, "w").write("import sys\nopen(%r, 'a').write(' '.join(sys.argv[1:]) + '\\n')\n" % argdatei)


def skript(hm, *opt):
    env = {**os.environ, "HALO_NACHT": nacht, "HALO_JETZT_HM": hm, "HALO_VM_FRISCH_PY": f"python3 {stub}",
           "HALO_VM_FRISCH_ARBEITSBAUM": "1"}
    return subprocess.run(["zsh", os.path.join(HIER, "vm-frisch.sh"), *opt], env=env).returncode


aufgerufen = lambda: open(argdatei).read().splitlines() if os.path.exists(argdatei) else []
skript("0030", "--taeglich")
skript("0120", "--taeglich")
check("vm-frisch.sh --taeglich: vor 00:45 und ab 01:15 nichts", aufgerufen() == [], f"{aufgerufen()}")
skript("0050", "--taeglich")
z = aufgerufen()
check("vm-frisch.sh --taeglich: startet vm_frisch.py aus eigener Kopie im Hintergrund, Marke erst bei Erfolg",
      len(z) == 1 and "/vm-frisch-" in z[0] and "vm_frisch.py --marke " in z[0] and "--hintergrund" in z[0]
      and "--aufraeumen" in z[0] and not os.path.exists(os.path.join(nacht, "vm-frisch.tag")), f"{z}")
open(os.path.join(nacht, "vm-frisch.tag"), "w").write(time.strftime("%Y-%m-%d") + "\n")
skript("0100", "--taeglich")
check("vm-frisch.sh --taeglich: nach Erfolg am selben Tag nichts mehr", len(aufgerufen()) == 1, f"{aufgerufen()}")
skript("1500", "--nach-lauf")
check("vm-frisch.sh --nach-lauf: jederzeit, mit --nach-lauf", len(aufgerufen()) == 2 and "--nach-lauf" in aufgerufen()[-1], f"{aufgerufen()}")
sk = open(os.path.join(HIER, "vm-frisch.sh")).read()
check("vm-frisch.sh nimmt die Dateien sonst aus dem letzten Commit (git show HEAD), nicht aus dem Arbeitsbaum",
      "show HEAD:tests/$f" in sk and "halo_test.py --vm-frisch" not in sk)

schlaefer.kill()
sys.exit(0 if all(ergebnisse) else 1)
