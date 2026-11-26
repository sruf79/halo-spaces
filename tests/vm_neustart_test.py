#!/usr/bin/env python3
"""Logiktest für Start, Kurztest und Herunterfahren der Windows-VM (tests/vm_frisch.py, tests/vm-frisch.sh, Anbindung
in halo_test.py). Grundsatz (Maintainer 21.11.2026): jede VM auf neon am Ende des Tests herunterfahren, vor dem Test
starten; nie pausieren.
Ohne VM: eine Attrappe für prlctl im PATH merkt sich den Zustand der VM in einer Datei und schreibt die Bildzeiten
des Kurztests je Messung aus FAKE_TAKT in die Freigabe (ein Ordner im Temp). Die Uhr ist eine Attrappe (sleep
stellt sie nur vor), der Test läuft in Sekunden.

Aufruf:  python3 tests/vm_neustart_test.py     (eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg)
"""
import contextlib
import importlib.util
import io
import re
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


import vm_frisch as vmf  # dasselbe Modul, das halo_test.py importiert (Attrappen gelten für beide)

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
if a[0] == "suspend":
    schreib("suspend-aufgerufen", "ja")  # nie mehr erlaubt (Prüfung unten)
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
        n = int(lies("bereit", "0")) + 1
        schreib("bereit", str(n))
        if n > int(os.environ.get("FAKE_BEREIT_NACH", "0")):  # Windows braucht so viele Abfragen bis zur Anmeldung
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
suspendiert = []   # Läufe, in denen prlctl suspend aufgerufen wurde (darf nie vorkommen)


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
    if os.path.exists(os.path.join(d, "suspend-aufgerufen")):
        suspendiert.append(" ".join(log))
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

# Start aus „stopped“ im Zeitrahmen (bis 5 Minuten ab dem Startbefehl; die Uhr ist eine Attrappe, je Abfrage 3 s)
check("Startfrist: 5 Minuten (VM_START_FRIST), Standard für Lauf und Wartung", vmf.VM_START_FRIST == 300
      and vmf.vm_ready.__defaults__ == (300,) and vmf.vm_kaltstart.__defaults__ == (300,))
res, out, aufrufe, z, _ = lauf("stopped", env={"FAKE_BEREIT_NACH": "60"}, ziel=lambda s: vmf.vm_ready(VM))
treffer = re.search(r"VM bereit nach (\d+) s", out)
sek = int(treffer.group(1)) if treffer else 999
check("Start aus stopped: Windows nach rund 3 Minuten angemeldet, innerhalb der Frist bereit", res == "stopped"
      and aufrufe.count("start") == 1 and "stop" not in aufrufe and 150 <= sek <= 300 and z == "running", f"{res!r} {aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("stopped", env={"FAKE_BEREIT_NACH": "110"}, ziel=lambda s: vmf.vm_ready(VM))
check("Start aus stopped: nach 5 Minuten keine Sitzung, Abbruch mit Frist im Text", isinstance(res, SystemExit)
      and "nach 300 s" in str(res.code), f"{res!r} {out!r}")

# im Lauf: VM starten (aus stopped) und Kurztest, EIN Neustart als Rückfall
res, out, aufrufe, z, _ = lauf("stopped", ziel=vorbereiten)
check("Lauf: VM aus stopped gestartet (kein stop, kein resume), Kurztest gut", not isinstance(res, SystemExit)
      and aufrufe.count("start") == 1 and "stop" not in aufrufe and "resume" not in aufrufe
      and "VM Bildtakt: 0 von 30" in out and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", ziel=vorbereiten)
check("Lauf: pausierte VM aus alter Zeit erst fortgesetzt, dann gestoppt und frisch gestartet", not isinstance(res, SystemExit)
      and "resume" in aufrufe and "stop" in aufrufe and "start" in aufrufe
      and aufrufe.index("resume") < aufrufe.index("stop") < aufrufe.index("start") and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("running", ziel=vorbereiten)
check("Lauf: laufende VM (übergeben bzw. --vm-weiter) bleibt, kein stop/start", not isinstance(res, SystemExit)
      and "stop" not in aufrufe and "start" not in aufrufe and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("stopped", env={"FAKE_TAKT": "gestoert,ok"}, ziel=vorbereiten)
check("Lauf: Bildtakt gestört, ein kalter Neustart behebt es", not isinstance(res, SystemExit)
      and aufrufe.count("stop") == 1 and aufrufe.count("start") == 2 and "FEHLER" not in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("stopped", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=vorbereiten)
check("Lauf: auch nach dem Neustart gestört, Abbruch FEHLER VM gestört", isinstance(res, SystemExit) and res.code == 1
      and aufrufe.count("start") == 2 and "FEHLER VM gestört" in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("stopped", env={"FAKE_TAKT": "gestoert", "HALO_VM_KEIN_NEUSTART": "1"}, ziel=vorbereiten)
check("Lauf mit HALO_VM_KEIN_NEUSTART=1: gestörter Takt nur Hinweis, kein Neustart", not isinstance(res, SystemExit)
      and "stop" not in aufrufe and aufrufe.count("start") == 1 and "kein Neustart" in out, f"{aufrufe} {out!r}")

# Herunterfahren
res, out, aufrufe, z, _ = lauf("running", ziel=lambda s: vmf.vm_stoppen(VM))
check("Herunterfahren: laufende VM mit stop, danach stopped", res is True and aufrufe.count("stop") == 1 and z == "stopped", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_STOP": "haengt"}, ziel=lambda s: vmf.vm_stoppen(VM))
check("Herunterfahren: hängt, folgt stop --kill", res is True and aufrufe.count("stop") == 2 and "hart beendet" in out
      and z == "stopped", f"{aufrufe} {out!r}")
res, out, aufrufe, z, _ = lauf("suspended", ziel=lambda s: vmf.vm_stoppen(VM))
check("Herunterfahren: pausierte VM erst fortgesetzt, dann gestoppt", res is True and aufrufe.index("resume") < aufrufe.index("stop")
      and z == "stopped", f"{aufrufe}")
res, out, aufrufe, z, _ = lauf("stopped", ziel=lambda s: vmf.vm_stoppen(VM))
check("Herunterfahren: gestoppte VM bleibt unberührt", res is True and aufrufe == ["status"], f"{aufrufe}")

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
def wartend(share):
    marke = os.path.join(share, f"wartet-{os.getpid()}")
    frei = vmf.lauf_lock_nehmen()
    ohne_marke = not os.path.exists(marke)
    vmf.lock_uebergeben(schlaefer.pid, "fremd")
    besetzt = vmf.lauf_lock_nehmen()
    mit_marke = os.path.exists(marke) and vmf.wartender_lauf() == os.getpid()
    vmf.lock_uebergeben(os.getpid(), "übergeben von vm-frisch")
    uebernommen = vmf.lauf_lock_nehmen()
    return frei, ohne_marke, besetzt, mit_marke, uebernommen, os.path.exists(marke)
res, out, aufrufe, z, share = lauf("stopped", ziel=wartend)
check("Sperre für den Lauf: frei genommen ohne Wartemarke, besetzt mit Marke, übergeben angenommen, Marke weg",
      res == (True, True, False, True, True, False), f"{res}")
def tote_marke(share):
    open(os.path.join(share, f"wartet-{tot.pid}"), "w").write("x")
    return vmf.wartender_lauf(), os.path.exists(os.path.join(share, f"wartet-{tot.pid}"))
res, out, aufrufe, z, share = lauf("stopped", ziel=tote_marke)
check("Wartemarke eines toten Prozesses zählt nicht und wird entfernt", res == (None, False), f"{res}")

# Wartung (vm-frisch.sh)
marke = os.path.join(tempfile.mkdtemp(prefix="vm-marke-"), "vm-frisch.tag")
res, out, aufrufe, z, share = lauf("stopped", ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: Start aus stopped, Kurztest, danach heruntergefahren, Sperre frei, Tagesmarke bei Erfolg", res == 0
      and aufrufe.count("start") == 1 and [a for a in aufrufe if a != "status"][-1] == "stop" and z == "stopped"
      and not os.path.exists(lockdatei(share)) and open(marke).read().strip() == time.strftime("%Y-%m-%d"),
      f"{res} {aufrufe} {out!r}")
os.remove(marke)
res, out, aufrufe, z, share = lauf("suspended", ziel=lambda s: vmf.frisch(VM))
check("vm-frisch: pausierte VM aus alter Zeit fortgesetzt, gestoppt, gestartet, am Ende heruntergefahren", res == 0
      and aufrufe.index("resume") < aufrufe.index("stop") < aufrufe.index("start") and z == "stopped", f"{res} {aufrufe}")
res, out, aufrufe, z, _ = lauf("running", env={"FAKE_TAKT": "gestoert,ok"}, ziel=lambda s: vmf.frisch(VM))
check("vm-frisch: Takt gestört, zweiter Start, kein Fehler, am Ende heruntergefahren", res == 0 and aufrufe.count("start") == 2
      and z == "stopped", f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("running", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: zweimal gestört, FEHLER VM gestört, VM heruntergefahren, Sperre frei, keine Tagesmarke",
      isinstance(res, SystemExit) and "FEHLER VM gestört" in out and z == "stopped"
      and not os.path.exists(lockdatei(share)) and not os.path.exists(marke), f"{res!r} {aufrufe} {out!r}")
def mit_wartendem(share):
    open(os.path.join(share, f"wartet-{schlaefer.pid}"), "w").write("x")
    return vmf.frisch(VM), vmf.lock_pid()
res, out, aufrufe, z, share = lauf("stopped", ziel=mit_wartendem)
check("vm-frisch: ein Lauf wartet auf die Sperre, er übernimmt die laufende VM samt Sperre (kein Herunterfahren)",
      res == (0, schlaefer.pid) and "stop" not in aufrufe and z == "running" and "übergeben" in out, f"{res} {aufrufe} {out!r}")
def mit_wartendem_gestoert(share):
    open(os.path.join(share, f"wartet-{schlaefer.pid}"), "w").write("x")
    try:
        return vmf.frisch(VM)
    except SystemExit as e:
        return e.code, vmf.lock_pid()
res, out, aufrufe, z, share = lauf("stopped", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=mit_wartendem_gestoert)
check("vm-frisch: gestört trotz wartendem Lauf, heruntergefahren, Sperre frei (der Lauf startet selbst)",
      res == (1, None) and z == "stopped", f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("stopped", ziel=lambda s: vmf.frisch(VM, laufen=True))
check("vm-frisch --laufen (Handarbeit): VM läuft danach weiter, Sperre frei", res == 0 and z == "running"
      and not os.path.exists(lockdatei(share)), f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("stopped", belegt="CI-Lauf auf dem GitHub-Runner", ziel=lambda s: vmf.frisch(VM, marke=marke))
check("vm-frisch: bei laufender CI ausgelassen (3), VM nicht angefasst, keine Sperre, keine Marke", res == 3
      and not [a for a in aufrufe if a != "status"] and not os.path.exists(lockdatei(share)) and not os.path.exists(marke),
      f"{res} {aufrufe} {out!r}")
zaehler = iter([None, "Testlauf (halo_test.py o. ä.)"])
res, out, aufrufe, z, share = lauf("stopped", belegt=lambda: next(zaehler), ziel=lambda s: vmf.frisch(VM))
check("vm-frisch: Test startet zwischen Prüfung und Sperre, Sperre zurückgegeben, ausgelassen", res == 3
      and not os.path.exists(lockdatei(share)) and "start" not in aufrufe, f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("running", lock=f"{schlaefer.pid} 2026-11-18 lauf\n", ziel=lambda s: vmf.frisch(VM, nach_lauf=True))
check("vm-frisch nach Lauf: Sperre eines lebenden Laufs bzw. einer Wartung, nichts tun", res == 3 and "stop" not in aufrufe
      and open(lockdatei(share)).read().startswith(str(schlaefer.pid)), f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("running", belegt="CI-Lauf auf dem GitHub-Runner", lock=f"{tot.pid} x lauf\n",
                                   ziel=lambda s: vmf.frisch(VM, nach_lauf=True))
check("vm-frisch nach Lauf (Abbruch, verwaiste Sperre): eigener CI-Job zählt nicht, nur herunterfahren", res == 0
      and "stop" in aufrufe and "start" not in aufrufe and z == "stopped", f"{res} {aufrufe} {out!r}")
res, out, aufrufe, z, share = lauf("running", belegt="CI-Lauf auf dem GitHub-Runner", lock=f"{os.getpid()} x übergeben\n",
                                   ziel=lambda s: vmf.frisch(VM, nach_lauf=True, nach_pid=tot.pid))
check("vm-frisch nach Lauf: übergebene Sperre, Lauf beendet, sofort heruntergefahren, Sperre danach frei", res == 0
      and "start" not in aufrufe and z == "stopped" and not os.path.exists(lockdatei(share)), f"{res} {aufrufe} {out!r}")
def nach_lauf_wartend(share):
    open(os.path.join(share, f"wartet-{schlaefer.pid}"), "w").write("x")
    return vmf.frisch(VM, nach_lauf=True), vmf.lock_pid()
res, out, aufrufe, z, share = lauf("running", ziel=nach_lauf_wartend)
check("vm-frisch nach Lauf: auch mit wartendem Folgelauf heruntergefahren (er startet frisch), Sperre frei",
      res == (0, None) and z == "stopped", f"{res} {aufrufe}")
res, out, aufrufe, z, share = lauf("suspended", lock=f"{os.getpid()} x übergeben\n", ziel=lambda s: vmf.frisch(VM, nach_lauf=True))
check("vm-frisch nach Lauf: pausierte VM aus alter Zeit fortgesetzt und gestoppt", res == 0 and "resume" in aufrufe
      and z == "stopped", f"{res} {aufrufe}")

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
      and ht.vm_vorbereiten.__module__ == "vm_frisch" and "vmf.lauf_lock_nehmen()" in quelle and "VM_LOCK, \"w\"" not in quelle)
check("win-bildtakt.ps1 geht in die VM (Lauf)", os.path.exists(os.path.join(HIER, "win-bildtakt.ps1")) and '"win-bildtakt.ps1"' in quelle)
def danach(share):
    ht.vmf.lock_nehmen("lauf")
    alt = ht.vmf.hintergrund
    ht.vmf.hintergrund = lambda argv, log: types.SimpleNamespace(pid=schlaefer.pid, argv=argv)
    try:
        ok = ht.vm_frisch_danach(VM)
    finally:
        ht.vmf.hintergrund = alt
    return ok, ht.vmf.lock_pid()
res, out, aufrufe, z, share = lauf("running", ziel=danach)
check("Lauf mit --vm übergibt die Sperre an das Herunterfahren im Hintergrund", res == (True, schlaefer.pid), f"{res} {out!r}")

# run_in_vm ganz, gegen die Attrappe (Lauf in der VM = leerer prlctl exec); Hintergrundprozess ersetzt
xpi = os.path.join(tempfile.mkdtemp(prefix="vm-xpi-"), "halo-spaces-test.xpi")
open(xpi, "w").write("x")


def ht_lauf(weiter=False, hintergrund_ok=True):
    def ziel(share):
        args = types.SimpleNamespace(vm=VM, beta=False, tb=ht.DEFAULT_TB, port=2899, dark=False, keep=False, only=None,
                                     eval=None, perf=False, tb_log=None, shots=None, compare=None, ohne_vergleich=False,
                                     vergleich_neu=False, vm_weiter=weiter)
        gesehen = []
        def hg(argv, log):
            if not hintergrund_ok:
                raise OSError("Attrappe: kein Hintergrundprozess")
            gesehen.append(argv)
            return types.SimpleNamespace(pid=schlaefer.pid)
        alt = (ht.VM_SHARE, ht.vmf.hintergrund, ht.wait_turn)
        ht.VM_SHARE, ht.vmf.hintergrund = share, hg
        ht.wait_turn = lambda mine: ht.vmf.lauf_lock_nehmen() or sys.exit("Sperre besetzt")
        try:
            rc = ht.run_in_vm(args, xpi)
        finally:
            ht.VM_SHARE, ht.vmf.hintergrund, ht.wait_turn = alt
        return rc, gesehen, ht.vmf.lock_pid()
    return lauf("stopped", ziel=ziel)


res, out, aufrufe, z, share = ht_lauf()
check("halo_test.py --vm: VM aus stopped gestartet, Lauf, danach Herunterfahren im Hintergrund (--nach-lauf, Sperre übergeben)",
      not isinstance(res, SystemExit) and res[0] == 0 and aufrufe.count("start") == 1 and res[1]
      and "--nach-lauf" in res[1][0] and res[2] == schlaefer.pid, f"{res!r} {aufrufe} {out!r}")
res, out, aufrufe, z, share = ht_lauf(hintergrund_ok=False)
check("halo_test.py --vm: Hintergrund scheitert, VM gleich selbst heruntergefahren, Sperre frei",
      not isinstance(res, SystemExit) and res[0] == 0 and z == "stopped" and res[2] is None, f"{res!r} {aufrufe} {out!r}")
res, out, aufrufe, z, share = ht_lauf(weiter=True)
check("halo_test.py --vm --vm-weiter (Handarbeit): VM läuft danach weiter, kein Herunterfahren, Sperre frei",
      not isinstance(res, SystemExit) and res[0] == 0 and z == "running" and not res[1] and "stop" not in aufrufe
      and res[2] is None, f"{res!r} {aufrufe} {out!r}")
check("Nie mehr pausieren: kein prlctl suspend in vm_frisch.py, halo_test.py und keinem Fall oben",
      '"suspend"' not in open(os.path.join(HIER, "vm_frisch.py")).read() and '"suspend"' not in quelle and not suspendiert,
      f"{suspendiert}")

# tests/vm-frisch.sh: Zeitfenster, Tagesmarke, Modi (Python ersetzt durch eine Attrappe, die die Argumente festhält)
nacht = tempfile.mkdtemp(prefix="vm-frisch-nacht-")
argdatei = os.path.join(nacht, "args")
stub = os.path.join(nacht, "stub.py")
open(stub, "w").write("import sys\nopen(%r, 'a').write(' '.join(sys.argv[1:]) + '\\n')\n" % argdatei)


def skript(hm, *opt):
    # verwaiste_tb_beenden (Umbau P2 K2) nur auf Probepfade: kein echter Prozess, kein echtes Profil, eigenes Protokoll
    env = {**os.environ, "HALO_NACHT": nacht, "HALO_JETZT_HM": hm, "HALO_VM_FRISCH_PY": f"python3 {stub}",
           "HALO_VM_FRISCH_ARBEITSBAUM": "1", "VERWAIST_TMP": os.path.join(nacht, "T"),
           "VERWAIST_LOG": os.path.join(nacht, "aufraeumen.log"),
           "VERWAIST_PROFIL_MUSTER": nacht + "/kein-profil/halo-test-[a-z]+", "VERWAIST_CI_MUSTER": nacht + "/kein-ci"}
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
vlog = open(os.path.join(nacht, "vm-frisch.log")).read() if os.path.exists(os.path.join(nacht, "vm-frisch.log")) else ""
check("vm-frisch.sh --taeglich: vorher verwaiste_tb_beenden, genau einmal (Zeile im Protokoll)",
      len(re.findall(r"Verwaiste Testprozesse(: nichts angefasst| beendet: 0)", vlog)) == 1, vlog[-400:])
skript("1500", "--nach-lauf")
check("vm-frisch.sh --nach-lauf: jederzeit, mit --nach-lauf", len(aufgerufen()) == 2 and "--nach-lauf" in aufgerufen()[-1], f"{aufgerufen()}")
sk = open(os.path.join(HIER, "vm-frisch.sh")).read()
check("vm-frisch.sh nimmt die Dateien sonst aus dem letzten Commit (git show HEAD), nicht aus dem Arbeitsbaum",
      "show HEAD:tests/$f" in sk and "halo_test.py --vm-frisch" not in sk)

schlaefer.kill()
sys.exit(0 if all(ergebnisse) else 1)
