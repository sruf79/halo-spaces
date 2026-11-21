#!/usr/bin/env python3
"""Test für tests/farben_css.py (engere Farb-Erkennung): eigenes Wegwerf-Repo, je Fall ein Commit."""
import os
import subprocess
import sys
import tempfile

PRUEFER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "farben_css.py")
START = """/* Kopf */
.a {
  width: 10px;
  color: red;
}

.b {
  margin: 4px;
  padding: var(--mt-pad-s);
}
"""
FAELLE = [
    ("nur Maß", START.replace("width: 10px", "width: 12px"), False),
    ("Maß-Variable", START.replace("var(--mt-pad-s)", "var(--mt-radius-m)"), False),
    ("Kommentar", START.replace("/* Kopf */", "/* Kopf\n   mit rot und dunkel */"), False),
    ("Farbe", START.replace("color: red", "color: blue"), True),
    ("Farbvariable", START.replace("margin: 4px", "background: var(--mt-control)"), True),
    ("Selektor eines Blocks mit Farbe", START.replace(".a {", ".a, .c {"), True),
    ("Selektor eines Blocks ohne Farbe", START.replace(".b {", ".b, .d {"), False),
    ("Dunkel-Block", START + "@media (prefers-color-scheme: dark) {\n  .b { margin: 2px; }\n}\n", True),
]


def git(*a, cwd):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def main():
    fehler = 0
    with tempfile.TemporaryDirectory() as d:
        git("init", "-q", cwd=d)
        git("config", "user.email", "t@example.invalid", cwd=d)
        git("config", "user.name", "t", cwd=d)
        with open(os.path.join(d, "x.css"), "w") as f:
            f.write(START)
        git("add", ".", cwd=d)
        git("commit", "-qm", "start", cwd=d)
        basis = git("rev-parse", "HEAD", cwd=d)
        for name, inhalt, soll in FAELLE:
            git("checkout", "-q", basis, cwd=d)
            with open(os.path.join(d, "x.css"), "w") as f:
                f.write(inhalt)
            git("commit", "-qam", name, cwd=d)
            r = subprocess.run([sys.executable, PRUEFER, basis, "HEAD", "x.css"], cwd=d, capture_output=True, text=True)
            ist = r.returncode == 0 and bool(r.stdout.strip())
            ok = r.returncode == 0 and ist == soll
            fehler += not ok
            print(f"{'OK' if ok else 'FEHLER'}  {name}: {'betroffen' if ist else 'nicht betroffen'} {r.stdout.strip()} {r.stderr.strip()[-200:]}")
    print(f"{len(FAELLE) - fehler} von {len(FAELLE)} Fällen OK")
    sys.exit(1 if fehler else 0)


if __name__ == "__main__":
    main()
