#!/usr/bin/env python3
"""Windows-VM für die Tests starten, prüfen und herunterfahren (Parallels auf dem Mac mini, tests/MAC-MINI.md
„Windows-VM“, docs/testrechner.md „Frische VM“).

Grundsatz für jede VM auf neon (Maintainer 21.11.2026, ENTSCHEIDUNGEN.md „VMs: nach jedem Test herunterfahren …“:
„ab sofort die windows vm nach ende jeden tests herunterfahren und zu beginn des tests auch starten“): am Ende jedes
Tests und jeder Wartung ganz herunterfahren (prlctl stop, bei Zeitüberschreitung --kill), nie mehr pausieren; vor dem
Test starten (aus „stopped“, bis 5 Minuten Warten auf die angemeldete Windows-Sitzung, Kurztest Bildtakt). Ein Zustand
„suspended“ aus alter Zeit wird erst fortgesetzt und dann gestoppt (stop greift bei einer pausierten VM nicht
zuverlässig). Hintergrund des Kurztests: am 18.11.2026 lieferte die VM nach langem Fortsetzen/Pausieren Bilder um 4 bis
12 Bilder verzögert; erst prlctl stop und start behoben das.

Wartung (frisch(), immer über tests/vm-frisch.sh, außer dem Herunterfahren direkt nach einem Lauf):
  vm_frisch.py [--vm NAME]            starten (läuft sie noch, kalt neu), Kurztest, danach herunterfahren; wartet ein
                                      Lauf mit --vm auf die Sperre, bekommt er die laufende VM samt Sperre („übergeben“);
                                      belegt (CI, Testlauf, Lauf in der VM): sofort auslassen (Exitcode 3)
  vm_frisch.py --nach-lauf            nach einem Lauf mit --vm bzw. nach Abbruch des CI-Jobs: nur herunterfahren, ohne
                                      Prüfung auf CI (der eigene Job endet gerade), die Sperre muss frei bzw. übergeben sein
  --nach-pid PID                      erst nach Ende dieses Prozesses (halo_test.py übergibt die Sperre an uns)
  --marke DATEI                       bei Erfolg das Datum hineinschreiben (Tagesmarke des täglichen Aufrufs)
  --hintergrund LOG                   sich selbst gelöst starten (eigene Sitzung: launchd und der GitHub-Runner
                                      beenden sonst mit dem Wächter bzw. Job auch diesen Prozess) und gleich zurück
  --aufraeumen                        am Ende den eigenen Ordner löschen (Kopie aus git show, tests/vm-frisch.sh)
  --laufen                            VM danach laufen lassen (Handarbeit)

Sperre ~/halo-vm/lauf.lock („PID Zeit Zweck“): atomar über os.link einer fertigen Datei, solange sie gilt, warten
Läufe auf dem Mac und in der VM (halo_test.py). Ein Lauf mit --vm, der auf die Sperre wartet, legt
~/halo-vm/wartet-<PID> an (lauf_lock_nehmen). halo_test.py importiert die VM-Funktionen von hier.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HIER = os.path.dirname(os.path.abspath(__file__))
VM_NAME = os.environ.get("HALO_VM", "Windows 11")
VM_SHARE = os.path.expanduser("~/halo-vm")  # einzige Freigabe der VM, dort \\Mac\halo
VM_UNC = r"\\Mac\halo"
VM_LOCK = os.path.join(VM_SHARE, "lauf.lock")  # Mac- und Windows-Läufe nie gleichzeitig
VM_START_FRIST = 300  # Start aus „stopped“ bis zur angemeldeten Windows-Sitzung: höchstens 5 Minuten


def prl(*args, check=True, timeout=300):
    return subprocess.run(["prlctl", *args], capture_output=True, text=True, check=check, timeout=timeout)


def vm_exec(vm, *cmd, check=True, timeout=120):
    """Befehl in der angemeldeten Windows-Sitzung (Argumente ohne Anführungszeichen – prlctl gibt sie nicht weiter)."""
    return prl("exec", vm, "--current-user", *cmd, check=check, timeout=timeout)


def vm_state(vm):
    out = prl("status", vm, check=False).stdout.split()
    return out[-1] if out else "unbekannt"


def vm_stoppen(vm):
    """Fährt die VM ganz herunter (prlctl stop, bei Zeitüberschreitung hart mit --kill). Eine pausierte VM (Zustand
    aus alter Zeit) wird erst fortgesetzt: stop greift bei ihr nicht zuverlässig. True, wenn sie danach steht."""
    state = vm_state(vm)
    if state in ("suspended", "paused"):
        print(f"VM „{vm}“ ist pausiert ({state}), wird fortgesetzt und dann heruntergefahren …", flush=True)
        try:
            prl("resume", vm, check=False, timeout=120)
        except subprocess.TimeoutExpired:
            pass
        state = vm_state(vm)
    if state == "stopped":
        return True
    if state not in ("running", "suspended", "paused"):
        print(f"FEHLER VM gestört: „{vm}“ im Zustand {state} (prlctl list -a)", flush=True)
        return False
    print(f"VM „{vm}“ wird heruntergefahren …", flush=True)
    try:
        ok = prl("stop", vm, check=False, timeout=120).returncode == 0
    except subprocess.TimeoutExpired:
        ok = False
    if not (ok and vm_bis_zustand(vm, "stopped", 30)):
        print("HINWEIS VM fährt nicht herunter, wird hart beendet (prlctl stop --kill)", flush=True)
        try:
            prl("stop", vm, "--kill", check=False, timeout=60)
        except subprocess.TimeoutExpired:
            pass
        if not vm_bis_zustand(vm, "stopped", 60):
            print(f"FEHLER VM gestört: „{vm}“ lässt sich nicht stoppen (Zustand {vm_state(vm)})", flush=True)
            return False
    return True


def vm_ready(vm, frist=VM_START_FRIST):
    """Startet die VM (aus „stopped“; pausiert aus alter Zeit: erst fortsetzen und herunterfahren) und wartet auf die
    angemeldete Sitzung, höchstens frist Sekunden ab dem Startbefehl (Standard 5 Minuten). Eine laufende VM (Übergabe,
    --vm-weiter) bleibt, wie sie ist. Liefert den Zustand vorher."""
    before = vm_state(vm)
    if before in ("suspended", "paused"):
        if not vm_stoppen(vm):
            sys.exit(1)
    elif before not in ("stopped", "running"):
        sys.exit(f"VM „{vm}“ nicht gefunden oder im Zustand {before} (prlctl list -a)")
    start = time.time()
    end = start + frist
    if before != "running":
        print(f"VM „{vm}“ wird gestartet …", flush=True)
        try:
            prl("start", vm, check=False, timeout=frist)
        except subprocess.TimeoutExpired:
            pass  # die Frist läuft ohnehin ab, die Abfrage unten entscheidet
    # gleich nach dem Start klappt ein erster Befehl oft, der nächste scheitert
    # trotzdem („PrlJob … Invalid argument“) – erst drei Antworten in Folge zählen
    ok = 0
    while time.time() < end:
        try:
            ok = ok + 1 if vm_exec(vm, "cmd", "/c", "echo", "bereit", check=False, timeout=30).stdout.strip() == "bereit" else 0
        except subprocess.TimeoutExpired:
            ok = 0
        if ok >= (3 if before != "running" else 1):
            if before != "running":
                print(f"VM bereit nach {time.time() - start:.0f} s (Frist {frist} s)", flush=True)
            return before
        time.sleep(3)
    sys.exit(f"VM „{vm}“: keine angemeldete Windows-Sitzung nach {frist} s (automatische Anmeldung prüfen)")


def vm_bis_zustand(vm, ziel, frist):
    """Wartet, bis die VM im Zustand ziel ist (höchstens frist Sekunden)."""
    end = time.time() + frist
    while True:
        if vm_state(vm) == ziel:
            return True
        if time.time() > end:
            return False
        time.sleep(2)  # Abfragetakt, kein festes Warten


def vm_kaltstart(vm, frist=VM_START_FRIST):
    """Kalter Start der VM: läuft sie, erst herunterfahren (vm_stoppen), dann starten und warten, bis die angemeldete
    Windows-Sitzung antwortet (höchstens frist Sekunden ab dem Start). Aus „stopped“ also nur der Start."""
    if not vm_stoppen(vm):
        sys.exit(1)
    return vm_ready(vm, frist)


# Kurztest Bildtakt: tests/win-bildtakt.ps1 zeichnet BILDTAKT_BILDER Bilder (rotes Feld, das je Bild seine Breite
# ändert) und misst die Abstände. Zu viele lange Bilder = VM gestört
BILDTAKT_BILDER = 30
BILDTAKT_FAKTOR = 1.6
BILDTAKT_MAX_LANG = 3


def bildtakt_gestoert(zeiten):
    """Bewertet die Bildzeiten (ms) des Kurztests. Liefert (gestört, Text); gestört ist None, wenn nichts messbar war.
    Gestört: mehr als BILDTAKT_MAX_LANG Bilder länger als BILDTAKT_FAKTOR × mittlere Bildzeit."""
    zeiten = [z for z in zeiten if z > 0]
    if len(zeiten) < BILDTAKT_BILDER // 2:
        return None, f"nicht messbar ({len(zeiten)} Bildzeiten)"
    mittel = sum(zeiten) / len(zeiten)
    lang = [z for z in zeiten if z > BILDTAKT_FAKTOR * mittel]
    text = (f"{len(lang)} von {len(zeiten)} Bildern länger als {BILDTAKT_FAKTOR} × Mittel {mittel:.1f} ms"
            + (f" (längstes {max(lang):.0f} ms)" if lang else ""))
    return len(lang) > BILDTAKT_MAX_LANG, text


def vm_bildtakt(vm, run, win):
    """Kurztest in der angemeldeten Sitzung, liefert die Bildzeiten in ms (leer, wenn nichts zurückkam)."""
    aus = os.path.join(run, "bildtakt.txt")
    if os.path.exists(aus):
        os.remove(aus)
    try:
        vm_exec(vm, "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", win + "\\tests\\win-bildtakt.ps1",
                win + "\\bildtakt.txt", str(BILDTAKT_BILDER), check=False, timeout=120)
    except subprocess.TimeoutExpired:
        return []
    try:
        return [float(x) for x in open(aus).read().split()]
    except (OSError, ValueError):
        return []


def vm_vorbereiten(vm, run, win, frisch=False):
    """Bereitet die VM vor: Bildschirm 1920 × 1080 und Kurztest Bildtakt (run/tests braucht win-display.ps1 und
    win-bildtakt.ps1). Lauf (frisch=False): VM starten (aus „stopped“; läuft sie schon, etwa nach Übergabe oder
    --vm-weiter, bleibt sie); ist der Takt gestört, EIN kalter Neustart als Rückfall, danach Abbruch „FEHLER VM
    gestört“. HALO_VM_KEIN_NEUSTART=1 (Läufe von Hand): kein Neustart, ein gestörter Takt ist nur ein Hinweis.
    Wartung (frisch=True): kalter Start (läuft sie noch, erst herunterfahren)."""
    neustart = frisch or os.environ.get("HALO_VM_KEIN_NEUSTART") != "1"
    for versuch in (1, 2):
        if frisch or versuch == 2:
            vm_kaltstart(vm)
        else:
            vm_ready(vm)
        # Bildschirm 1920 × 1080 (ohne Fenster der VM wählt Parallels 1024 × 768)
        vm_exec(vm, "powershell", "-ExecutionPolicy", "Bypass", "-File", win + "\\tests\\win-display.ps1", win + "\\display.txt", check=False)
        gestoert, text = bildtakt_gestoert(vm_bildtakt(vm, run, win))
        print(f"VM Bildtakt: {text}", flush=True)
        if not gestoert:  # (None: Kurztest nicht messbar, es geht trotzdem weiter)
            return
        if versuch == 2:
            print(f"FEHLER VM gestört: Bildtakt auch nach einem kalten Neustart gestört ({text}); "
                  f"VM von Hand prüfen (prlctl stop/start „{vm}“, Parallels neu starten)", flush=True)
            sys.exit(1)
        if not neustart:
            print("HINWEIS Bildtakt der VM gestört, kein Neustart (HALO_VM_KEIN_NEUSTART=1)", flush=True)
            return
        print("HINWEIS Bildtakt der VM gestört, kalter Neustart …", flush=True)


# --- Sperre ---

def lock_pid():
    """PID des Prozesses, der die VM gerade benutzt (lebend), sonst None."""
    try:
        pid = int(open(VM_LOCK).read().split()[0])
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError, IndexError):
        return None


def lock_nehmen(zweck, pid=None):
    """Nimmt die Sperre atomar: fertige Datei anlegen, dann os.link (scheitert, wenn die Sperre schon da ist; ein
    Leser sieht nie eine halb geschriebene Datei). Eine verwaiste Sperre (Prozess tot) wird ersetzt. True bei Erfolg."""
    os.makedirs(VM_SHARE, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".lock-", dir=VM_SHARE)
    try:
        os.write(fd, f"{pid or os.getpid()} {time.strftime('%Y-%m-%d %H:%M:%S')} {zweck}\n".encode())
        os.close(fd)
        for _ in range(3):
            try:
                os.link(tmp, VM_LOCK)
                return True
            except FileExistsError:
                if lock_pid() is not None:
                    return False
                # verwaist: beiseite legen und neu versuchen (rename ist atomar; ein zweiter Prozess, der dieselbe
                # verwaiste Sperre sieht, scheitert danach an os.link oder an der lebenden neuen Sperre)
                try:
                    os.rename(VM_LOCK, VM_LOCK + f".alt-{os.getpid()}")
                    os.remove(VM_LOCK + f".alt-{os.getpid()}")
                except FileNotFoundError:
                    pass
        return False
    finally:
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass


def _wartemarke(pid=None):
    return os.path.join(VM_SHARE, f"wartet-{pid or os.getpid()}")


def lauf_lock_nehmen():
    """Sperre für einen Lauf mit --vm (halo_test.py, wait_turn): True, wenn sie diesem Prozess gehört (frei genommen
    oder von der Wartung samt laufender VM übergeben). Solange nicht, liegt ~/halo-vm/wartet-<PID>: daran sieht die
    Wartung, dass ein Lauf unmittelbar folgt, und fährt die VM nicht herunter, sondern übergibt sie."""
    if lock_pid() == os.getpid() or lock_nehmen("lauf"):
        lauf_warten_ende()
        return True
    try:
        open(_wartemarke(), "w").write(time.strftime("%Y-%m-%d %H:%M:%S") + "\n")
    except OSError:
        pass
    return False


def lauf_warten_ende():
    """Entfernt die eigene Wartemarke (Lauf hat die Sperre bzw. wartet nicht mehr auf sie)."""
    try:
        os.remove(_wartemarke())
    except OSError:
        pass


def wartender_lauf():
    """PID des Laufs mit --vm, der am längsten auf die Sperre wartet (lebend), sonst None. Marken toter Prozesse
    werden entfernt."""
    try:
        namen = os.listdir(VM_SHARE)
    except OSError:
        return None
    lebend = []
    for n in namen:
        if not n.startswith("wartet-"):
            continue
        pfad = os.path.join(VM_SHARE, n)
        try:
            pid = int(n[len("wartet-"):])
            os.kill(pid, 0)
            lebend.append((os.path.getmtime(pfad), pid))
        except (ValueError, OSError):
            try:
                os.remove(pfad)
            except OSError:
                pass
    return min(lebend)[1] if lebend else None


def lock_uebergeben(pid, zweck):
    """Übergibt die eigene Sperre ohne Lücke an pid (atomares Ersetzen)."""
    fd, tmp = tempfile.mkstemp(prefix=".lock-", dir=VM_SHARE)
    os.write(fd, f"{pid} {time.strftime('%Y-%m-%d %H:%M:%S')} {zweck}\n".encode())
    os.close(fd)
    os.replace(tmp, VM_LOCK)


def lock_freigeben():
    """Gibt die Sperre frei, wenn sie diesem Prozess gehört (oder verwaist ist)."""
    try:
        pid = int(open(VM_LOCK).read().split()[0])
    except (OSError, ValueError, IndexError):
        return
    if pid == os.getpid() or lock_pid() is None:
        try:
            os.remove(VM_LOCK)
        except FileNotFoundError:
            pass


# Wann die Neustart-Runde die VM nicht anfassen darf: gleiche Muster wie belegt() in tests/lauf-hilfen.zsh
BELEGT_MUSTER = [
    (r"actions-runner/bin[^/ ]*/Runner\.Worker", "CI-Lauf auf dem GitHub-Runner"),
    (r"^([^ ]*/)?[Pp]ython[0-9.]*( -[^ ]+)* ([^ ]*/)?tests/(halo_test|ui_tour|update_test|store_shots)\.py", "Testlauf (halo_test.py o. ä.)"),
    (r"^/.*/(thunderbird|thunderbird-bin) .*-marionette", "Thunderbird mit Marionette"),
]


def vm_belegt():
    """Grund, warum die VM gerade nicht neu gestartet werden darf (CI, Testlauf, Lauf in der VM), sonst None."""
    if lock_pid() not in (None, os.getpid()):
        return "Lauf in der Windows-VM"
    for muster, grund in BELEGT_MUSTER:
        r = subprocess.run(["pgrep", "-f", "--", muster], capture_output=True, text=True)
        if any(int(p) != os.getpid() for p in r.stdout.split()):
            return grund
    return None


def frisch(vm, nach_lauf=False, nach_pid=None, marke=None, laufen=False):
    """Wartung. nach_lauf: nur herunterfahren. Sonst kalter Start, Kurztest, danach herunterfahren; wartet ein Lauf mit
    --vm auf die Sperre, geht die laufende VM samt Sperre an ihn („übergeben“, er startet sie nicht neu); laufen: VM
    laufen lassen (Handarbeit). Exitcode 0 erledigt, 1 VM gestört, 3 ausgelassen (belegt)."""
    if not shutil.which("prlctl"):
        print("ÜBERSPRUNGEN vm-frisch: prlctl fehlt", flush=True)
        return 3
    if nach_pid:  # halo_test.py übergibt die Sperre und endet gleich; höchstens 2 Minuten warten
        end = time.time() + 120
        while time.time() < end:
            try:
                os.kill(nach_pid, 0)
            except OSError:
                break
            time.sleep(1)  # Abfragetakt
    if lock_pid() != os.getpid():
        if not nach_lauf and (grund := vm_belegt()):
            print(f"ÜBERSPRUNGEN vm-frisch: {grund}", flush=True)
            return 3
        if not lock_nehmen("vm-frisch"):
            print("ÜBERSPRUNGEN vm-frisch: Lauf in der Windows-VM bzw. Wartung läuft schon", flush=True)
            return 3
        # zwischen Prüfung und Sperre gestartet? (ein Mac-Lauf prüft die Sperre nur beim Start)
        if not nach_lauf and (grund := vm_belegt()):
            lock_freigeben()
            print(f"ÜBERSPRUNGEN vm-frisch: {grund}", flush=True)
            return 3
    if nach_lauf:
        try:
            if not vm_stoppen(vm):
                return 1
            print(f"VM heruntergefahren: „{vm}“ nach dem Lauf", flush=True)
            return 0
        finally:
            lock_freigeben()
    run = tempfile.mkdtemp(prefix="frisch-", dir=VM_SHARE)
    win = VM_UNC + "\\" + os.path.basename(run)
    erfolg = False
    try:
        os.makedirs(os.path.join(run, "tests"))
        for f in ("win-display.ps1", "win-bildtakt.ps1"):
            shutil.copy(os.path.join(HIER, f), os.path.join(run, "tests", f))
        vm_vorbereiten(vm, run, win, frisch=True)
        print(f"VM frisch: „{vm}“ kalt gestartet, Bildtakt geprüft", flush=True)
        if marke:
            with open(marke, "w") as f:
                f.write(time.strftime("%Y-%m-%d") + "\n")
        erfolg = True
        return 0
    finally:
        try:
            wartet = wartender_lauf() if erfolg and not laufen else None
            if wartet and vm_state(vm) == "running":
                # ein Lauf folgt unmittelbar: er übernimmt die laufende VM samt Sperre, kein Herunterfahren
                lock_uebergeben(wartet, "übergeben von vm-frisch")
                print(f"VM läuft weiter: übergeben an den wartenden Lauf (PID {wartet})", flush=True)
            elif not laufen:
                vm_stoppen(vm)
        finally:
            shutil.rmtree(run, ignore_errors=True)
            lock_freigeben()


def hintergrund(argv, log):
    """Startet dieses Skript gelöst in eigener Sitzung (start_new_session: weder launchd beim Ende des Wächters noch
    der GitHub-Runner beim Jobende beenden es; RUNNER_TRACKING_ID leer, sonst räumt der Runner es als Rest des Jobs
    ab). Liefert den Prozess."""
    out = open(log, "a") if log else subprocess.DEVNULL
    return subprocess.Popen([sys.executable, "-u", os.path.abspath(__file__), *argv], stdin=subprocess.DEVNULL,
                            stdout=out, stderr=subprocess.STDOUT, start_new_session=True,
                            env={**os.environ, "RUNNER_TRACKING_ID": ""}, cwd=HIER)


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description="Windows-VM starten, Bildtakt prüfen und herunterfahren")
    ap.add_argument("--vm", default=VM_NAME)
    ap.add_argument("--nach-lauf", action="store_true")
    ap.add_argument("--nach-pid", type=int)
    ap.add_argument("--marke")
    ap.add_argument("--hintergrund", metavar="LOG")
    ap.add_argument("--aufraeumen", action="store_true")
    ap.add_argument("--laufen", action="store_true")
    a = ap.parse_args(argv)
    if a.hintergrund is not None:
        rest = [x for i, x in enumerate(argv) if x != "--hintergrund" and (i == 0 or argv[i - 1] != "--hintergrund")]
        p = hintergrund(rest, a.hintergrund)
        print(f"vm-frisch im Hintergrund gestartet (PID {p.pid})", flush=True)
        return 0
    try:
        return frisch(a.vm, nach_lauf=a.nach_lauf, nach_pid=a.nach_pid, marke=a.marke, laufen=a.laufen)
    finally:
        if a.aufraeumen and os.path.basename(HIER).startswith("vm-frisch-"):
            shutil.rmtree(HIER, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
