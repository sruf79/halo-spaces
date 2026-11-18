#!/usr/bin/env python3
"""Logiktest für den kalten Neustart der Windows-VM vor jedem Lauf mit --vm (halo_test.py: vm_kaltstart,
vm_vorbereiten, bildtakt_gestoert). Ohne VM: eine Attrappe für prlctl im PATH merkt sich den Zustand der VM
in einer Datei und schreibt die Bildzeiten des Kurztests je Start aus FAKE_TAKT. Die Uhr ist ebenfalls
eine Attrappe (sleep stellt sie nur vor), der Test läuft in Sekundenbruchteilen.

Aufruf:  python3 tests/vm_neustart_test.py     (eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg)
"""
import contextlib
import importlib.util
import io
import os
import stat
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
        aus = a[a.index(next(x for x in a if x.endswith("win-bildtakt.ps1"))) + 1].split("\\")[-1]
        takt = os.environ.get("FAKE_TAKT", "ok").split(",")
        art = takt[min(int(lies("starts", "1")), len(takt)) - 1]
        zeiten = [16.7] * 30 if art == "ok" else [16.7] * 26 + [150.0] * 4
        schreib(aus, " ".join(map(str, zeiten)))
'''

ergebnisse = []


def check(name, ok, info=""):
    ergebnisse.append(ok)
    print(f"{'OK     ' if ok else 'FEHLER '} {name}" + ("" if ok else f"  ({info})"), flush=True)


def lauf(zustand, env=None, ziel=None):
    """Führt ziel() mit frischer Attrappe aus; liefert (Rückgabe oder SystemExit, Ausgabe, prlctl-Aufrufe, Zustand)."""
    d = tempfile.mkdtemp(prefix="vm-attrappe-")
    p = os.path.join(d, "prlctl")
    open(p, "w").write(ATTRAPPE)
    os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
    open(os.path.join(d, "zustand"), "w").write(zustand)
    alt = dict(os.environ)
    os.environ.update({"PATH": d + os.pathsep + alt["PATH"], "FAKE_DIR": d, **(env or {})})
    uhr = [1000.0]
    ht.time = types.SimpleNamespace(time=lambda: uhr[0], sleep=lambda s: uhr.__setitem__(0, uhr[0] + s),
                                    strftime=time.strftime)
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            try:
                res = ziel(d)
            except SystemExit as e:
                res = e
    finally:
        os.environ.clear()
        os.environ.update(alt)
        ht.time = time
    log = open(os.path.join(d, "log")).read().splitlines() if os.path.exists(os.path.join(d, "log")) else []
    return res, out.getvalue(), [z.split()[0] for z in log], open(os.path.join(d, "zustand")).read()


VM = "Windows 11"
WIN = r"\\Mac\halo\lauf-test"
vorbereiten = lambda d: ht.vm_vorbereiten(VM, d, WIN)

# Bewertung des Kurztests
check("Bildtakt: 30 gleichmäßige Bilder sind nicht gestört", ht.bildtakt_gestoert([16.7] * 30)[0] is False)
check("Bildtakt: 4 von 30 Bildern über 1,6 × Mittel sind gestört", ht.bildtakt_gestoert([16.7] * 26 + [150.0] * 4)[0] is True)
check("Bildtakt: genau 3 lange Bilder sind noch nicht gestört", ht.bildtakt_gestoert([16.7] * 27 + [150.0] * 3)[0] is False)
check("Bildtakt: ohne Messwerte nicht messbar (None, Lauf geht weiter)", ht.bildtakt_gestoert([])[0] is None)

# kalter Neustart
res, out, aufrufe, z = lauf("running", ziel=lambda d: ht.vm_kaltstart(VM))
check("Kaltstart aus laufender VM: stop, dann start, VM läuft", aufrufe.count("stop") == 1 and "start" in aufrufe
      and aufrufe.index("stop") < aufrufe.index("start") and z == "running", f"{aufrufe} {z}")
res, out, aufrufe, z = lauf("suspended", ziel=lambda d: ht.vm_kaltstart(VM))
check("Kaltstart aus pausierter VM: resume, stop, start", aufrufe[:3] == ["status", "resume", "status"]
      and "stop" in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z = lauf("stopped", ziel=lambda d: ht.vm_kaltstart(VM))
check("Kaltstart aus gestoppter VM: nur start", "stop" not in aufrufe and "start" in aufrufe and z == "running", f"{aufrufe}")
res, out, aufrufe, z = lauf("running", env={"FAKE_STOP": "haengt"}, ziel=lambda d: ht.vm_kaltstart(VM))
check("Kaltstart: fährt die VM nicht herunter, folgt stop --kill", aufrufe.count("stop") == 2
      and "hart beendet" in out and z == "running", f"{aufrufe} {out!r}")
res, out, aufrufe, z = lauf("invalid", ziel=lambda d: ht.vm_kaltstart(VM))
check("Kaltstart: unbekannter Zustand bricht mit FEHLER VM gestört ab", isinstance(res, SystemExit)
      and "FEHLER VM gestört" in out, f"{res!r} {out!r}")

# Vorbereitung mit Kurztest
res, out, aufrufe, z = lauf("suspended", ziel=vorbereiten)
check("Vorbereitung: ein Neustart, Bildtakt gut, kein Abbruch", not isinstance(res, SystemExit) and aufrufe.count("start") == 1
      and "VM Bildtakt: 0 von 30" in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z = lauf("running", env={"FAKE_TAKT": "gestoert,ok"}, ziel=vorbereiten)
check("Vorbereitung: Bildtakt gestört, zweiter Neustart behebt es", not isinstance(res, SystemExit)
      and aufrufe.count("start") == 2 and "zweiter kalter Neustart" in out and "FEHLER" not in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z = lauf("running", env={"FAKE_TAKT": "gestoert,gestoert"}, ziel=vorbereiten)
check("Vorbereitung: zweimal gestört bricht mit FEHLER VM gestört ab", isinstance(res, SystemExit) and res.code == 1
      and aufrufe.count("start") == 2 and "FEHLER VM gestört" in out, f"{aufrufe} {out!r}")
res, out, aufrufe, z = lauf("suspended", env={"HALO_VM_KEIN_NEUSTART": "1"}, ziel=vorbereiten)
check("HALO_VM_KEIN_NEUSTART=1: nur fortsetzen, kein stop/start, kein Kurztest",
      "resume" in aufrufe and "stop" not in aufrufe and "start" not in aufrufe and "Bildtakt" not in out and z == "running",
      f"{aufrufe} {out!r}")

# Dateien für die VM
check("win-bildtakt.ps1 liegt neben halo_test.py und wird in die VM kopiert",
      os.path.exists(os.path.join(HIER, "win-bildtakt.ps1")) and '"win-bildtakt.ps1"' in open(os.path.join(HIER, "halo_test.py")).read())

sys.exit(0 if all(ergebnisse) else 1)
