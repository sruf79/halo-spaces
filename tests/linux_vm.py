"""Linux-VM auf neon (Parallels, VM „Ubuntu“, Ubuntu ARM64 mit GNOME): halo_test.py mit echter Oberfläche statt xvfb.
Zweck (Maintainer 21.11.2026, „ja ok“): nur Werkzeug für einen Linux-Rundgang und Design-Entscheidungen. GitHub-Linux
bleibt die einzige Quelle für grün; ein Lauf hier übersteuert nichts und zählt nie für die Testmarke.

Aufruf über halo_test.py (wie --vm für Windows):
  python3 tests/halo_test.py --linux-vm --port 2871 [--dark] [--beta] [--only …] [--shots ORDNER]
Wartung:
  python3 tests/linux_vm.py --einrichten   VM starten, tests/linux-vm-setup.sh (root und Sitzung), herunterfahren
  python3 tests/linux_vm.py --stopp        nur herunterfahren

Ablauf eines Laufs: Sperre ~/halo-vm/lauf.lock (gemeinsam mit Mac- und Windows-Läufen, ohne Wartemarke, damit die
Wartung der Windows-VM ihre VM nie an diesen Lauf übergibt), VM starten (aus „stopped“, bis 5 Minuten bis zur
angemeldeten Sitzung), Bildschirm 1920 × 1080 (tests/linux-display.py), Dateien in einen Ordner unter ~/halo-vm (in
der VM /media/psf/halo-vm), Farbschema der Sitzung setzen, halo_test.py in der Sitzung starten, Screenshots zurück,
Farbschema zurück, VM herunterfahren (Grundsatz für jede VM auf neon, Maintainer 21.11.2026: vor dem Test starten, am
Ende herunterfahren, nie pausieren; --vm-weiter lässt sie für Handarbeit laufen).
`prlctl exec` reicht keine Anführungszeichen weiter: Optionen gehen als args.json, Befehle als lauf.sh in die VM."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vm_frisch as vmf  # noqa: E402  (prlctl, Sperre, Herunterfahren)

VM_NAME = os.environ.get("HALO_LINUX_VM", "Ubuntu")
VM_SHARE = vmf.VM_SHARE
VM_MOUNT = "/media/psf/halo-vm"  # Freigabe ~/halo-vm in der VM
VM_TB = {"release": "/snap/bin/thunderbird", "beta": "/snap/bin/thunderbird_beta"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEIEN = ("halo_test.py", "testserver.py", "sprung_lib.py", "toolbar_lib.py", "perf.js", "linux-display.py",
           "linux-vm-setup.sh", "logik/konsole-schluessel.js")

# lauf.sh in der VM: Umgebung der GNOME-Sitzung (prlctl exec --current-user bringt sie nicht mit), eigenes TMPDIR im
# Benutzerordner (der Thunderbird-Snap sieht ein eigenes /tmp), Farbschema setzen und danach zurück
LAUF_SH = """#!/bin/bash
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
export WAYLAND_DISPLAY=wayland-0 DISPLAY=:0 XDG_SESSION_TYPE=wayland PATH=/snap/bin:$PATH
export TMPDIR=$HOME/halo-lauf/{name}
mkdir -p "$TMPDIR"
alt_schema=$(gsettings get org.gnome.desktop.interface color-scheme)
alt_gtk=$(gsettings get org.gnome.desktop.interface gtk-theme)
zurueck() {{ gsettings set org.gnome.desktop.interface color-scheme "$alt_schema"; gsettings set org.gnome.desktop.interface gtk-theme "$alt_gtk"; rm -rf "$TMPDIR"; }}
trap zurueck EXIT
gsettings set org.gnome.desktop.interface color-scheme {schema}
gsettings set org.gnome.desktop.interface gtk-theme {gtk}
sleep 2  # GNOME färbt die Fensterrahmen um (feste Pause wie bei der Windows-VM)
python3 -u {mount}/tests/halo_test.py --vm-args {mount}/args.json
"""


def vm_exec(*cmd, root=False, check=False, timeout=120):
    return vmf.prl("exec", VM_NAME, *([] if root else ["--current-user"]), *cmd, check=check, timeout=timeout)


def vm_ready(frist=vmf.VM_START_FRIST):
    """Startet die VM (aus „stopped“) und wartet auf die angemeldete GNOME-Sitzung (drei Antworten in Folge, wie bei
    Windows: gleich nach dem Start scheitert ein Befehl oft noch). Liefert den Zustand vorher."""
    before = vmf.vm_state(VM_NAME)
    if before in ("suspended", "paused"):
        if not vmf.vm_stoppen(VM_NAME):
            sys.exit(1)
    elif before not in ("stopped", "running"):
        sys.exit(f"VM „{VM_NAME}“ nicht gefunden oder im Zustand {before} (prlctl list -a)")
    start = time.time()
    if before != "running":
        print(f"VM „{VM_NAME}“ wird gestartet …", flush=True)
        try:
            vmf.prl("start", VM_NAME, check=False, timeout=frist)
        except subprocess.TimeoutExpired:
            pass
    ok = 0
    while time.time() < start + frist:
        try:
            r = vm_exec("test", "-S", "/run/user/1000/wayland-0", timeout=30)
            ok = ok + 1 if r.returncode == 0 else 0
        except subprocess.TimeoutExpired:
            ok = 0
        if ok >= (3 if before != "running" else 1):
            if before != "running":
                print(f"VM bereit nach {time.time() - start:.0f} s", flush=True)
            return before
        time.sleep(3)  # Abfragetakt
    sys.exit(f"VM „{VM_NAME}“: keine angemeldete Sitzung nach {frist} s (automatische Anmeldung prüfen)")


def exec_mit_wiederholung(*cmd, root=False, timeout=600):
    """prlctl exec scheitert gleich nach dem Start gelegentlich sofort mit 255 („PrlJob … Invalid argument“):
    dann einmal kurz warten und neu versuchen."""
    for versuch in (1, 2, 3):
        began = time.time()
        r = vm_exec(*cmd, root=root, timeout=timeout)
        if r.returncode != 255 or time.time() - began > 30 or versuch == 3:
            return r
        time.sleep(5)


def sperre_nehmen():
    """Gemeinsame Sperre ~/halo-vm/lauf.lock (höchstens eine Stunde warten), ohne Wartemarke (siehe oben)."""
    end, said = time.time() + 3600, False
    while subprocess.run(["pgrep", "-f", "--", "-profile .*/halo-test-"], capture_output=True).returncode == 0 \
            or not vmf.lock_nehmen("lauf linux"):  # Test-Thunderbird auf dem Mac oder Lauf in einer VM
        if time.time() > end:
            sys.exit("Abbruch: ein anderer Lauf (VM) ist nach einer Stunde noch nicht fertig")
        if not said:
            print("Warte: es läuft ein Test auf dem Mac oder in einer VM …", flush=True)
            said = True
        time.sleep(10)


def bildschirm(run):
    exec_mit_wiederholung("python3", f"{VM_MOUNT}/{os.path.basename(run)}/tests/linux-display.py",
                          f"{VM_MOUNT}/{os.path.basename(run)}/display.txt")
    try:
        _, b, h = open(os.path.join(run, "display.txt")).read().split()
        print(f"Bildschirm der VM {b} × {h}", flush=True)
        if int(b) < 1600 or int(h) < 1000:
            print(f"HINWEIS Bildschirm der VM nur {b} × {h} (tests/linux-display.py)", flush=True)
    except (OSError, ValueError):
        print("HINWEIS Bildschirmgröße der VM unbekannt", flush=True)


def lauf(args, xpi):
    """Führt halo_test.py in der Linux-VM aus (aufgerufen von halo_test.py --linux-vm). Rückgabe: Exitcode."""
    if not shutil.which("prlctl"):
        sys.exit("prlctl fehlt – Parallels Desktop (Pro) installieren")
    os.makedirs(VM_SHARE, exist_ok=True)
    sperre_nehmen()
    run = tempfile.mkdtemp(prefix="lauf-", dir=VM_SHARE)
    os.chmod(run, 0o755)
    mount = f"{VM_MOUNT}/{os.path.basename(run)}"
    before = None
    try:
        for f in DATEIEN:
            os.makedirs(os.path.dirname(os.path.join(run, "tests", f)), exist_ok=True)
            shutil.copy(os.path.join(ROOT, "tests", f), os.path.join(run, "tests", f))
        shutil.copytree(os.path.join(ROOT, "extension"), os.path.join(run, "extension"))
        shutil.copy(os.path.join(ROOT, "updates.json"), os.path.join(run, "updates.json"))
        shutil.copy(xpi, os.path.join(run, os.path.basename(xpi)))
        tb = VM_TB["beta" if args.beta else "release"]
        inner = {"xpi": f"{mount}/{os.path.basename(xpi)}", "tb": tb, "port": args.port, "dark": args.dark,
                 "keep": args.keep, "only": args.only, "eval": args.eval, "perf": args.perf,
                 "tb_log": f"{mount}/thunderbird.log" if args.tb_log else None,
                 "shots": f"{mount}/shots" if args.shots else None, "compare": None,
                 "ohne_vergleich": args.ohne_vergleich, "vergleich_neu": args.vergleich_neu}
        if args.compare:
            shutil.copytree(args.compare, os.path.join(run, "vorher"))
            inner["compare"] = f"{mount}/vorher"
        json.dump(inner, open(os.path.join(run, "args.json"), "w"))
        with open(os.path.join(run, "lauf.sh"), "w") as f:
            f.write(LAUF_SH.format(name=os.path.basename(run), mount=mount,
                                   schema="prefer-dark" if args.dark else "default",
                                   gtk="Yaru-dark" if args.dark else "Yaru"))

        before = vmf.vm_state(VM_NAME)  # vor dem Start gesetzt: bricht er ab, fährt finally die VM trotzdem herunter
        vm_ready()
        bildschirm(run)
        print(f"Linux-VM „{VM_NAME}“ (vorher {before}) · {tb}", flush=True)
        began = time.time()
        proc = subprocess.Popen(["prlctl", "exec", VM_NAME, "--current-user", "bash", f"{mount}/lauf.sh"])
        try:
            rc = proc.wait(timeout=3600)
        except subprocess.TimeoutExpired:
            proc.kill()
            vm_exec("pkill", "-f", "halo-lauf/")
            rc = 1
            print("FEHLER  Testlauf in der VM nach einer Stunde abgebrochen", flush=True)
        if rc == 255 and time.time() - began < 30:
            print("FEHLER  prlctl exec scheiterte sofort (Code 255) – Gastwerkzeuge nicht bereit", flush=True)
        if args.shots and os.path.isdir(os.path.join(run, "shots")):
            shutil.copytree(os.path.join(run, "shots"), args.shots, dirs_exist_ok=True)
        if args.tb_log and os.path.exists(os.path.join(run, "thunderbird.log")):
            shutil.copy(os.path.join(run, "thunderbird.log"), args.tb_log)
        return rc
    finally:
        try:
            if before and not args.vm_weiter:
                vmf.vm_stoppen(VM_NAME)
        finally:
            shutil.rmtree(run, ignore_errors=True)
            vmf.lock_freigeben()


def einrichten():
    """Wartung: VM starten, tests/linux-vm-setup.sh als root (Programme) und in der Sitzung, danach herunterfahren."""
    sperre_nehmen()
    run = tempfile.mkdtemp(prefix="einrichten-", dir=VM_SHARE)
    os.chmod(run, 0o755)
    try:
        shutil.copy(os.path.join(ROOT, "tests", "linux-vm-setup.sh"), run)
        skript = f"{VM_MOUNT}/{os.path.basename(run)}/linux-vm-setup.sh"
        vm_ready()
        r1 = exec_mit_wiederholung("bash", skript, root=True, timeout=1800)
        r2 = exec_mit_wiederholung("bash", skript, "--benutzer")
        print((r1.stdout + r2.stdout).strip(), flush=True)
        print((r1.stderr + r2.stderr).strip(), file=sys.stderr, flush=True)
        return 0 if r1.returncode == 0 and r2.returncode == 0 else 1
    finally:
        try:
            vmf.vm_stoppen(VM_NAME)
        finally:
            shutil.rmtree(run, ignore_errors=True)
            vmf.lock_freigeben()


if __name__ == "__main__":
    if sys.argv[1:] == ["--einrichten"]:
        sys.exit(einrichten())
    if sys.argv[1:] == ["--stopp"]:
        sys.exit(0 if vmf.vm_stoppen(VM_NAME) else 1)
    sys.exit("Aufruf: linux_vm.py --einrichten | --stopp (Testläufe: halo_test.py --linux-vm)")
