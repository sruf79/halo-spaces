"""Stellt in der Linux-VM (GNOME, Wayland) den Bildschirm auf 1920 × 1080 bei Skalierung 1 und schreibt die Größe
danach in eine Datei („<connector> <breite> <höhe>“). Ohne Fenster der VM wählt Parallels 1024 × 768, das 1500 × 900
große Testfenster ragte darüber hinaus (wie bei der Windows-VM, tests/win-display.ps1).
Aufruf in der angemeldeten Sitzung: python3 linux-display.py <ausgabedatei> [<breite> <höhe>]"""
import os
import sys

os.environ.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
os.environ.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
from gi.repository import Gio, GLib  # noqa: E402  (python3-gi gehört zu Ubuntu Desktop)

ZIEL = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1920, 1080)
bus = Gio.bus_get_sync(Gio.BusType.SESSION)


def rufen(methode, werte=None):
    return bus.call_sync("org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig",
                         "org.gnome.Mutter.DisplayConfig", methode, werte, None, Gio.DBusCallFlags.NONE, 10000, None)


def aktuell():
    serial, monitore, _, _ = rufen("GetCurrentState").unpack()
    (connector, *_), modi, _ = monitore[0]
    jetzt = next((m for m in modi if m[6].get("is-current")), None)
    return serial, connector, modi, jetzt


serial, connector, modi, jetzt = aktuell()
if not jetzt or (jetzt[1], jetzt[2]) != ZIEL:
    mode = max((m for m in modi if (m[1], m[2]) == ZIEL), key=lambda m: m[3], default=None)
    if mode:
        # Methode 1 = vorübergehend (bis zur nächsten Änderung durch Parallels oder Neustart; jeder Lauf stellt neu ein)
        rufen("ApplyMonitorsConfig", GLib.Variant("(uua(iiduba(ssa{sv}))a{sv})",
                                                    (serial, 1, [(0, 0, 1.0, 0, True, [(connector, mode[0], {})])], {})))
    serial, connector, modi, jetzt = aktuell()
with open(sys.argv[1], "w") as f:
    f.write(f"{connector} {jetzt[1] if jetzt else 0} {jetzt[2] if jetzt else 0}\n")
