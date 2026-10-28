# Mac mini als Testrechner

Ein Mac mini (Apple Silicon) übernimmt rund um die Uhr die Tests:
`tests/halo_test.py` hell und dunkel, `tests/beta.sh` und den Rundgang
`tests/ui_tour.py`. Er ist nur über Tailscale erreichbar. Claude Code läuft auf
dem Mini selbst und wird per SSH aus der Desktop-App bedient.

`tests/mac-mini-setup.sh` prüft alle Punkte dieser Anleitung und nennt zu jedem
offenen Punkt den Befehl oder die Stelle in den Systemeinstellungen:

```bash
tests/mac-mini-setup.sh --check                # nur prüfen, ändert nichts
tests/mac-mini-setup.sh --check --probelauf    # dazu ein Testlauf (einige Minuten)
tests/mac-mini-setup.sh                        # prüfen, einrichten was ohne Passwort geht, Testlauf
```

Ausgabe: je Punkt eine Zeile `OK`, `OFFEN` oder `HINWEIS`, darunter mit `→` was
zu tun ist. Rückgabewert 0 nur, wenn nichts offen ist. Das Skript läuft im
Testbenutzer und kann beliebig oft aufgerufen werden.

Im Folgenden heißt der Testbenutzer `halotest` und der Mini in Tailscale
`halo-mini` – beide Namen sind frei wählbar.

| Was | Wie | Warum |
|---|---|---|
| Benutzer | eigener Standardbenutzer ohne echte Mails, automatische Anmeldung | Thunderbird braucht eine Bildschirmsitzung; Testläufe sollen keine echten Daten sehen |
| Netz | Tailscale, keine Portfreigabe | von außen ist kein Dienst offen |
| Zugriff | SSH über Tailscale, Claude Code aus der Desktop-App | Arbeiten am Mini ohne Bildschirm |
| CI (optional) | GitHub-Runner als LaunchAgent im Testbenutzer | Tests unter macOS bei jedem Push auf `main` |
| Windows (optional) | Parallels-VM mit Windows 11, Test per `halo_test.py --vm` | Windows-Abweichungen sehen, ohne zweiten Rechner |
| Cloud (optional) | `claude remote-control` als LaunchAgent | Cloud-Sitzungen und die Claude-App steuern den Mini, ohne dass er von außen erreichbar ist |

## 1. Verwalteter Mac?

```bash
profiles status -type enrollment
```

Steht dort `MDM enrollment: Yes` oder `Enrolled via DEP: Yes`, ist der Mac bei
einer IT angemeldet (z. B. Jamf). Ein lokales Administratorkonto der IT im
Anmeldeverlauf ist ein weiteres Zeichen dafür. Die Verwaltung kann dann
automatische Anmeldung, das Ausschalten von FileVault, die Rechte für
Bildschirmaufnahme und VPN-Programme wie Tailscale sperren oder zurücksetzen.
Diese Punkte vorher mit der IT klären. Das Skript weist darauf hin, erzwingt
aber nichts.

## 2. Testbenutzer

Als Administrator anlegen: Systemeinstellungen → Benutzer:innen & Gruppen →
Benutzer hinzufügen, Typ **Standard** (kein Administrator; auf neon ist der
Testbenutzer `neosky.cat` Administrator – das geht auch, das Skript weist nur
darauf hin). Oder:

```bash
sudo sysadminctl -addUser halotest -fullName "halo Test" -password -
```

In diesem Benutzer keine Apple-ID, keine Mailkonten, keine echten Kontakte und
keine echten Passwörter im Schlüsselbund. Die Tests legen zwar jedes Mal ein
frisches Thunderbird-Profil an, halo.spaces kann aber zum Beispiel Kontaktfotos
aus den macOS-Kontakten des angemeldeten Benutzers lesen.

**Automatische Anmeldung:** Thunderbird öffnet nur Fenster, wenn der Benutzer
am Bildschirm angemeldet ist – auch wenn niemand davor sitzt. Nach einem
Neustart (Update, Stromausfall) meldet macOS den Testbenutzer dann wieder an.

- FileVault muss dafür aus sein (auf einem Testrechner ohne echte Daten
  vertretbar): Systemeinstellungen → Datenschutz & Sicherheit → FileVault,
  oder `sudo fdesetup disable`.
- Systemeinstellungen → Benutzer:innen & Gruppen → „Automatisch anmelden als“ →
  `halotest`, oder:

  ```bash
  sudo sysadminctl -autologin set -userName halotest -password -
  ```

- Andere Benutzer abmelden statt nur „Benutzer wechseln“: Die Tests brauchen die
  Sitzung des Testbenutzers im Vordergrund.

**Ruhezustand aus** – schläft der (auch unsichtbare) Bildschirm, hält macOS die
Fenster an, und Animationen oder Aufnahmen gehen schief:

```bash
sudo pmset -a sleep 0 displaysleep 0 disksleep 0 womp 1 autorestart 1
```

`autorestart 1` startet den Mac nach einem Stromausfall von selbst. Den
Bildschirmschoner schaltet `tests/mac-mini-setup.sh` im Testbenutzer aus.

## 3. Programme (als Administrator)

- **Thunderbird** nach `/Applications`. Einfachster Weg: `tests/mac-mini-setup.sh`
  einmal als Administrator ausführen – es lädt die aktuelle Version von Mozilla
  und übernimmt sie nur mit Mozillas Signatur. Der Testbenutzer kann Thunderbird
  nicht selbst aktualisieren. Meldet das Skript eine veraltete Version, es
  wieder als Administrator ausführen.
- **Python 3 und git:** `xcode-select --install` (im Fenster auf „Installieren“ klicken).
- **Homebrew, gh, tmux, jq** (optional, für die Aufgabenliste und das Arbeiten per
  SSH, z. B. vom iPhone):

  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
  brew install gh tmux jq
  gh auth login --scopes project      # Code unter github.com/login/device eingeben
  ```

  Kein `python` und kein `git` über Homebrew: Sie lägen in Sitzungen vorn im
  PATH, der Runner liest `~/.zprofile` aber nicht – Läufe von Hand und CI liefen
  dann mit verschiedenem Python.
- **Tailscale:** <https://tailscale.com/download/mac>, mit dem eigenen Konto
  anmelden, Start beim Anmelden einschalten.

Danach als Testbenutzer das Repo holen und prüfen:

```bash
git clone https://github.com/sruf79/halo-spaces.git ~/halo-spaces
~/halo-spaces/tests/mac-mini-setup.sh --check
```

## 4. Tailscale und SSH statt Portfreigabe

Im Router oder in der Firewall wird **kein** Port freigegeben. Der Mini ist nur
über seine Tailscale-Adresse (`100.x.y.z`) bzw. seinen Tailscale-Namen
erreichbar.

**Entfernte Anmeldung (SSH):** Systemeinstellungen → Allgemein → Teilen →
Entfernte Anmeldung → ein, „Zugriff erlauben für“ nur `halotest`.

**Nur mit Schlüssel anmelden.** Auf dem Laptop (falls noch kein Schlüssel da ist):

```bash
ssh-keygen -t ed25519
```

```bash
ssh-copy-id halotest@halo-mini
```

Wenn `ssh halotest@halo-mini` ohne Passwort klappt, auf dem Mini als
Administrator die Anmeldung per Passwort abschalten (gilt ab der nächsten
Verbindung):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/050-halo.conf
```

macOS lässt SSH auf allen Netzen zu, also auch im lokalen Netz bzw.
Institutsnetz. Mit Anmeldung nur per Schlüssel ist das vertretbar. Hat der Mini
eine öffentliche Adresse, Port 22 von außen sperren lassen (IT).

Eintrag in `~/.ssh/config` auf dem Laptop:

```
Host halo-mini
  HostName halo-mini
  User halotest
```

Für den Blick auf den Bildschirm (Rechte bestätigen, Fenster ansehen) RustDesk
oder die macOS-Bildschirmfreigabe über die Tailscale-Adresse benutzen.

## 5. Bildschirm ohne Monitor

Per SSH prüfen:

```bash
system_profiler SPDisplaysDataType
```

Maßgeblich ist „UI Looks like“ (bzw. „Resolution“): mindestens 1600 × 1000.
Ohne Monitor liefert der Mac mini 1920 × 1080 – das reicht für die
Testfenster (1500 × 900). Ist der Wert kleiner oder fehlt der Bildschirm ganz:
einen virtuellen Bildschirm mit BetterDisplay anlegen (als Hauptbildschirm).
Ein HDMI-Dummy-Stecker nur, wenn das nicht geht.

## 6. Rechte für Bildschirmaufnahme (nur `ui_tour.py`)

`halo_test.py` braucht keine Rechte: Seine Bilder macht Thunderbird selbst
(Marionette). `ui_tour.py` nimmt zusätzlich Menüs, Popups und Rückfragen mit
`screencapture -l` auf – nur Fenster des eigenen Test-Thunderbird. Dafür braucht
das Programm, das den Rundgang startet, das Recht **Bildschirm- &
Systemaudioaufnahme** (Systemeinstellungen → Datenschutz & Sicherheit):

| Rundgang gestartet aus | Eintrag |
|---|---|
| Terminal am Mini (per RustDesk) | Terminal |
| SSH – also auch Claude Code aus der Desktop-App | `/usr/libexec/sshd-keygen-wrapper` (mit „+“ hinzufügen, ⇧⌘G für den Pfad) |
| GitHub-Runner | nicht nötig (der Job startet nur `halo_test.py`) |

Danach das Programm neu starten bzw. neu per SSH verbinden. Neuere
macOS-Versionen fragen in Abständen erneut nach; dann einmal per RustDesk
bestätigen. Bei einem verwalteten Mac kann die IT das Recht per Profil vergeben.

**Automation** ist derzeit nicht nötig: `ui_tour.py` liest per `osascript` nur
die Fensterliste und steuert keine anderen Programme.

`tests/mac-mini-setup.sh` fragt das Recht ab, ohne eine Rückfrage auszulösen,
und macht eine Probeaufnahme nur eines eigenen Testfensters. Es meldet das
Ergebnis für das Programm, aus dem es gestartet wurde – also einmal im Terminal
und einmal per SSH ausführen.

## 7. Claude Code per SSH aus der Desktop-App

In der Desktop-App im Code-Tab: Umgebungsauswahl unter dem Eingabefeld → **New
environment** → Reiter **SSH** → Host → **Add SSH connection…**

- SSH host: `halo-mini` (aus `~/.ssh/config`) oder `halotest@<Tailscale-Name>`
- Worktree folder (optional): z. B. `~/halo-worktrees`

Dann den Ordner `~/halo-spaces` wählen → **Create environment**. Beim ersten
Verbinden richtet die Desktop-App Claude Code auf dem Mini selbst ein (rund
1 GB unter `~/.claude/remote/`).

Regeln für Testläufe auf dem Mini:

- Jeder Testlauf bekommt einen eigenen Marionette-Port (`--port`), damit
  mehrere Sitzungen und der Runner gleichzeitig testen können: 2839 ist der
  Standard, 2845 nimmt der CI-Job, ab 2850 für Läufe von Hand.
- Thunderbird-Fenster aus einer SSH-Sitzung erscheinen in der Bildschirmsitzung
  desselben Benutzers – deshalb die automatische Anmeldung. Geprüft auf dem Mac
  mini (macOS 27): `tests/mac-mini-setup.sh --check --probelauf` per SSH, alle
  Prüfungen von `halo_test.py` OK.
- Nie zwei Testläufe auf demselben Port: Der zweite verbindet sich mit dem
  Thunderbird des ersten und bricht mit „Marionette-Verbindung geschlossen“ ab.

## 8. GitHub-Runner (optional)

**Sicherheit zuerst.** Das Repo ist öffentlich: Jeder kann einen Pull-Request
stellen, und ein Pull-Request kann die Workflow-Datei selbst ändern. Die
`if:`-Bedingung allein schützt den Mini deshalb nicht. Drei Sperren:

1. GitHub → Repo → Settings → Actions → General → „Approval for running fork
   pull request workflows from contributors“ → **Require approval for all
   external contributors**. Läufe aus fremden Pull-Requests nie ungeprüft
   freigeben.
2. Job `mac` in `.github/workflows/test.yml` läuft nur bei Push auf `main` und
   beim Start von Hand (`if:`), nie bei `pull_request`.
3. Wächter auf dem Mini: `tests/mac-runner-hook.sh` wird nach
   `~/.config/halo-spaces/runner-hook.sh` kopiert und in `~/actions-runner/.env`
   eingetragen. Der Runner führt ihn vor jedem Job aus; er weist alles außer
   Push auf `main` und Start von Hand ab. Ein Pull-Request kann diese Datei
   nicht ändern.

Dazu begrenzt der Testbenutzer (Standardbenutzer, keine echten Daten) den
möglichen Schaden.

**Einrichten (als Testbenutzer):**

1. GitHub → Repo → Settings → Actions → Runners → **New self-hosted runner** →
   macOS, ARM64. Die angezeigten Befehle in `~/actions-runner` ausführen; bei
   `./config.sh` das Label `halo-mac` angeben und als Namen denselben wie in
   Tailscale (z. B. `--labels halo-mac --name halo-mini`). Das Label wählt den
   Rechner für den Job aus, der Name erscheint nur in der Runner-Liste.
2. Als LaunchAgent einrichten – ohne `sudo`:

   ```bash
   cd ~/actions-runner && ./svc.sh install && ./svc.sh start
   ```

   Der Runner startet dann mit der Sitzung des Testbenutzers (automatische
   Anmeldung). Als Systemdienst (LaunchDaemon) hätte er keine
   Bildschirmsitzung, und Thunderbird könnte keine Fenster öffnen.
3. `~/halo-spaces/tests/mac-mini-setup.sh` (ohne `--check`) richtet den Wächter
   ein. Danach den Runner neu starten:

   ```bash
   cd ~/actions-runner && ./svc.sh stop && ./svc.sh start
   ```

4. Probe: GitHub → Actions → **Test** → **Run workflow**. Ergebnis: Artefakt
   `test-mac` mit den Ordnern `hell/`, `dunkel/` und `beta/` (Screenshots und
   Thunderbird-Protokoll).

Ist der Mini aus, wartet der Job bis zu 24 Stunden; die Linux-Ergebnisse sind
trotzdem sofort da. Der Runner aktualisiert sich selbst. Die Thunderbird Beta
liegt im Cache unter `~/Library/Caches/halo-spaces/tb-beta` (höchstens einmal
pro Woche neu geladen).

## 9. Laufende Zweige auf den Mini bringen

Es wandert nur, was committet ist – offene Änderungen vorher committen (auch
als Zwischenstand).

**Per Push direkt auf den Mini** (bleibt privat, läuft über Tailscale und SSH),
einmalig auf dem Laptop:

```bash
git remote add mini halo-mini:halo-spaces
```

Danach je Zweig:

```bash
git push mini bugfix/2026-10-20
```

Auf dem Mini: `git switch bugfix/2026-10-20`. Einen Zweig, der auf dem Mini
gerade ausgecheckt ist, nimmt Git nur an, wenn das einmal auf dem Mini erlaubt
wurde – dann aktualisiert der Push auch die Dateien dort (solange auf dem Mini
nichts Uncommittetes liegt):

```bash
git -C ~/halo-spaces config receive.denyCurrentBranch updateInstead
```

**Per Push über GitHub:** `git push origin <zweig>`, auf dem Mini
`git fetch origin` und `git switch <zweig>`. Das Repo ist öffentlich – der
Zweig ist dann für alle sichtbar.

**Per `git bundle`** (ohne SSH, z. B. über Taildrop oder USB-Stick):

```bash
git bundle create ~/zweige.bundle bugfix/2026-10-20 design/durchlauf
```

Die Datei auf den Mini kopieren, dort:

```bash
git fetch ~/zweige.bundle bugfix/2026-10-20:bugfix/2026-10-20 design/durchlauf:design/durchlauf
```

## 10. Screenshots für die Aufgabenliste

Bilder zu Bugs und Wünschen liegen auf dem Mini in `~/halo-aufgaben/bilder/`
(nicht im Repo, oft mit echten Mails). Damit sie ohne Umweg über den Chat dort
landen, auf dem Laptop am Ende von `~/.zshrc` anhängen (Host wie in
`~/.ssh/config`, bei Bedarf anpassen) und ein neues Terminalfenster öffnen:

```bash
halobild() {
  [ -n "$1" ] || { echo "Aufruf: halobild <name>"; return 1; }
  local tmp=$(mktemp -t halobild).png
  osascript -e "set f to open for access POSIX file \"$tmp\" with write permission" \
            -e 'write (the clipboard as «class PNGf») to f' \
            -e 'close access f' 2>/dev/null \
    || { echo "Kein Bild in der Zwischenablage"; rm -f "$tmp"; return 1; }
  scp "$tmp" "halotest@halo-mini:halo-aufgaben/bilder/$1.png" && echo "→ Mini: $1.png"
  rm -f "$tmp"
}
```

TextEdit ersetzt beim Einfügen gern `"` durch typografische Anführungszeichen –
vorher unter Bearbeiten → Ersetzungen „Intelligente Anführungszeichen“
ausschalten. Prüfen mit `type halobild` („shell function“).

Benutzen:

1. ⌃⇧⌘4 (oder ⇧⌘5 mit „Sichern unter: Zwischenablage“) – Bild landet in der
   Zwischenablage, keine Datei auf dem Laptop.
2. `halobild kalender-woche-raster` – Name klein, mit Bindestrichen, ohne
   Leerzeichen und ohne `.png`, Bereich vorneweg; gleicher Name überschreibt.
3. Im Gespräch mit dem Agenten nur den Namen nennen („Bild: kalender-woche-raster“).

## 11. Windows-VM (Parallels)

Auf dem Mini läuft Parallels Desktop **Pro** (für `prlctl`/`prlsrvctl`; die
Standard-Ausgabe hat keine Befehlszeile) mit einer Windows-11-VM (ARM, Enterprise).
`tests/halo_test.py --vm` testet darin wie unter macOS: frisches Profil,
Paket aus `dist/`, hell oder dunkel, Screenshots zurück auf den Mac.

| Was | Einstellung | Warum |
|---|---|---|
| VM | Name `Windows 11` (anderer Name: `HALO_VM=…`), Windows-Hostname `win11` | |
| Größe | fest 4 Kerne, 6 GB | daneben laufen die macOS-Tests (16 GB im Mini) |
| Start | `--autostart start-host`, `--autostop shutdown` | startet mit dem Mac, auch nach Stromausfall (`pmset autorestart 1`) |
| Freigabe | nur `~/halo-vm` (in Windows `\\Mac\halo`), kein geteiltes Profil, keine geteilten Programme | die VM sieht nichts vom Benutzerordner |
| Windows | automatische Anmeldung, kein Ruhezustand, keine Bildschirmsperre, kein Sperrbildschirm, kein Update-Neustart bei angemeldetem Benutzer | Thunderbird braucht eine Sitzung |
| Programme | Thunderbird (x64, `C:\Program Files\Mozilla Thunderbird`), Beta (`C:\Program Files\Thunderbird Beta`), Python 3.15 (ARM64), Git für Windows (für `openssl`) | Mozilla baut Thunderbird nicht für ARM64 – läuft unter der Windows-Emulation |
| Bildschirm | 1920 × 1080 bei Skalierung 100 % | ohne Fenster der VM wählt Parallels 1024 × 768 – das 1500 × 900 große Testfenster ragte darüber hinaus (Schnellfenster-Lage, Breiten rot); `halo_test.py --vm` stellt die Auflösung vor jedem Lauf ein (`tests/win-display.ps1`), die Skalierung `win-vm-setup.ps1 -Benutzer` |
| Snapshot | `sauber` nach der Einrichtung | zurück: `prlctl snapshot-switch "Windows 11" --id <id>` (`prlctl snapshot-list`) |

Am Bildschirm (einmalig, nicht per Skript): Windows installieren und aktivieren,
Benutzer anlegen und automatisch anmelden lassen, Parallels Tools installieren.
Kein Microsoft-Konto, keine echten Mails in der VM.

Alles andere richtet `tests/mac-mini-setup.sh` ein (ohne `--check`): die
VM-Einstellungen am Mac und über `tests/win-vm-setup.ps1` die Windows-Seite
(als SYSTEM per `prlctl exec`). Das Skript lädt nur von Mozilla, python.org und
GitHub (Git für Windows) und startet ein Installationsprogramm nur mit gültiger
Signatur des Herausgebers. Thunderbird aktualisiert sich nicht selbst
(`distribution/policies.json`); neue Versionen holt ein erneuter Aufruf des
Skripts. Mit `--check` wird eine pausierte VM nicht geweckt.

```bash
python3 tests/halo_test.py --vm --port 2851 --shots /tmp/win-hell           # hell
python3 tests/halo_test.py --vm --port 2851 --dark --shots /tmp/win-dunkel  # dunkel
python3 tests/halo_test.py --vm --beta --port 2851                          # Thunderbird Beta
```

- Ablauf: VM fortsetzen bzw. starten und auf die Windows-Sitzung warten,
  Paket, `halo_test.py`, `perf.js` und `extension/` in einen Ordner unter
  `~/halo-vm` legen, Farbschema per Registry (`AppsUseLightTheme`,
  `SystemUsesLightTheme`) setzen, in der VM `python halo_test.py` als
  angemeldeter Benutzer starten (`prlctl exec --current-user`), Screenshots
  zurückkopieren, Farbschema zurücksetzen, VM pausieren (`prlctl suspend`,
  gibt die 6 GB frei; `--vm-weiter` lässt sie laufen).
- Marionette läuft nur in der VM auf `127.0.0.1`, kein Port ist im VM-Netz offen.
  Die Port-Regeln gelten trotzdem (`--port`, ab 2850 von Hand).
- Mac- und Windows-Läufe nie gleichzeitig: ein Lauf mit `--vm` wartet, bis kein
  Test-Thunderbird mehr auf dem Mac läuft; ein Mac-Lauf wartet auf
  `~/halo-vm/lauf.lock` (höchstens eine Stunde).
- `prlctl exec` reicht keine Anführungszeichen weiter; deshalb gehen die
  Optionen als `args.json` über die Freigabe in die VM.
- CI: Job `windows` in `.github/workflows/test.yml` läuft nach `mac` mit
  derselben Bedingung (nur Push auf `main` und von Hand) auf demselben Runner
  und Wächter, vorerst nur hell (`--vm --port 2845`), Screenshots als Artefakt
  `test-windows`.
- Windows-Abweichungen werden wie die Linux-Abweichungen behandelt: in der VM
  ist `sys.platform` `win32`, Prüfungen mit `sys.platform != "darwin"` gelten
  dort genauso.

## 12. Steuerung aus Cloud-Sitzungen (Remote Control)

Cloud-Sitzungen (claude.ai/code, Claude-App) laufen in einem Container ohne
Tailscale und erreichen den Mini nicht per SSH. Stattdessen hält ein
LaunchAgent auf dem Mini `claude remote-control` im Checkout offen. claude
verbindet sich dabei selbst nach außen – am Mini wird kein Port geöffnet,
Tailscale und SSH bleiben, wie sie sind.

Einmalig im Testbenutzer (per SSH oder am Bildschirm):

```bash
curl -fsSL https://claude.ai/install.sh | bash   # falls claude noch fehlt (landet in ~/.local/bin)
cd ~/halo-spaces && claude                       # mit dem Claude-Konto anmelden, „Trust this folder“, /exit
tests/mac-mini-setup.sh                          # richtet den LaunchAgent ein und startet ihn
```

- LaunchAgent `at.halo-spaces.remote-control`, Skript nach
  `~/.config/halo-spaces/remote-control.sh` kopiert (wie der Runner-Wächter
  nicht aus dem Checkout), Protokoll `~/Library/Logs/halo-remote-control.log`.
  Startet mit der automatischen Anmeldung und nach einem Absturz neu
  (höchstens einmal pro Minute).
- Die Sitzungen heißen `neon` (`HALO_RC_NAME` ändert das) und erscheinen in
  der Claude-App unter Claude Code. Rückfragen zu Rechten zeigt die App.
  Rechte-Modus: der von Claude Code auf dem Mini, mit `HALO_RC_MODUS` (z. B.
  `acceptEdits`) im Skript fest einstellbar.
- Aus einer Cloud-Sitzung: `ListAgents` zeigt die Sitzung auf dem Mini,
  `SendMessage` an `neon` gibt ihr eine Aufgabe. Beim ersten Mal fragt die
  Claude-App einmalig, ob Cloud-Sitzungen die eigenen Rechner erreichen
  dürfen – nur auf einem vertrauenswürdigen Gerät bestätigen.
- Die Sitzung auf dem Mini arbeitet im Checkout `~/halo-spaces` mit allem,
  was der Mini hat (Thunderbird, Tests, Windows-VM, `gh project …`). Die
  Regeln für Testläufe (Abschnitt 7) gelten auch für sie.
- Neu starten: `launchctl kickstart -k gui/$(id -u)/at.halo-spaces.remote-control`;
  abschalten: `launchctl bootout gui/$(id -u)/at.halo-spaces.remote-control`
  und die plist in `~/Library/LaunchAgents/` löschen.
