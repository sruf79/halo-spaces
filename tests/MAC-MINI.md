# Mac mini als Testrechner

Ein Mac mini (Apple Silicon) übernimmt rund um die Uhr die Tests:
`tests/halo_test.py` hell und dunkel (die Beta nur noch unter Linux in der CI) und den Rundgang
`tests/ui_tour.py`. Er ist nur über Tailscale erreichbar. Claude Code läuft auf
dem Mini selbst und wird per SSH aus der Desktop-App bedient.

`tests/mac-mini-setup.sh` prüft alle Punkte dieser Anleitung und nennt zu jedem
offenen Punkt den Befehl oder die Stelle in den Systemeinstellungen:

```bash
tests/mac-mini-setup.sh --check                # nur prüfen, ändert nichts
tests/mac-mini-setup.sh --check --probelauf    # dazu ein Testlauf (einige Minuten)
tests/mac-mini-setup.sh                        # prüfen, einrichten was ohne Passwort geht, Testlauf
tests/mac-mini-setup.sh --ohne-probelauf       # einrichten ohne Testlauf (z. B. nach Änderungen an den Läufen)
```

`--port N` wählt den Marionette-Port des Probelaufs (Standard 2850). Das
Skript richtet auch die LaunchAgents der Läufe ein (Abschnitte 12–16).

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
| Läufe | Nachtlauf, CI-Wächter, Wochenprüfung, Doku-Prüfung als LaunchAgents (Abschnitte 13–16) | Liste abarbeiten und veröffentlichen, rote CI melden, Läufe und Doku auswerten – ohne Desktop-App-Sitzung |

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
  und übernimmt sie nur mit Mozillas Signatur. Danach aktualisiert der Nachtlauf
  Thunderbird jede Nacht selbst (Abschnitt 13) – das geht nur, wenn die App
  dem Testbenutzer gehört; sonst einmal `sudo chown -R <Testbenutzer>
  /Applications/Thunderbird.app` (der Nachtlauf-Bericht nennt den Befehl).
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
   `test-mac` mit den Ordnern `hell/` und `dunkel/` (Screenshots und
   Thunderbird-Protokoll). Bei einem Push läuft `dunkel/` nur, wenn Farben
   betroffen sind (`tests/farben-betroffen.sh`).

Ist der Mini aus, wartet der Job bis zu 24 Stunden; die Linux-Ergebnisse sind
trotzdem sofort da. Der Runner aktualisiert sich selbst. Der Job `mac` testet
die Beta nicht mehr; für Läufe von Hand mit `tests/beta.sh` liegt sie im Cache
unter `~/Library/Caches/halo-spaces/tb-beta` (höchstens einmal pro Woche neu
geladen).

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

Bilder zu Bugs und Wünschen liegen auf dem Mini in `~/halo-aufgaben/bilder/`,
Apple-Vorlagen in `~/halo-aufgaben/apple/` (nicht im Repo, oft mit echten
Mails). `halobild` legt sie im Eingang `~/halo-aufgaben/eingang/` ab;
`tests/bilder-eingang.zsh` sortiert sie alle 15 Minuten ein (Abschnitt 18).
Damit sie ohne Umweg über den Chat dort landen, auf dem Laptop am Ende von
`~/.zshrc` anhängen (Ziel `neosky.cat@neon` über Tailscale, wie in
`~/.ssh/config`; der frühere Testbenutzer `halotest@halo-mini` ist veraltet)
und ein neues Terminalfenster öffnen:

```bash
halobild() {
  [ -n "$1" ] || { echo "Aufruf: halobild <name>"; return 1; }
  local tmp=$(mktemp -t halobild).png
  osascript -e "set f to open for access POSIX file \"$tmp\" with write permission" \
            -e 'write (the clipboard as «class PNGf») to f' \
            -e 'close access f' 2>/dev/null \
    || { echo "Kein Bild in der Zwischenablage"; rm -f "$tmp"; return 1; }
  scp "$tmp" "neosky.cat@neon:halo-aufgaben/eingang/$1.png" && echo "→ neon: eingang/$1.png"
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
   Leerzeichen und ohne `.png`, Bereich vorneweg; gleicher Name ersetzt die
   ältere Fassung. Ungültige Namen bleiben im Eingang (Meldung aufs iPhone).
3. Im Gespräch mit dem Agenten nur den Namen nennen („Bild: kalender-woche-raster“).

**Apple-Vorlagen** (Screenshots von Apple Mail, Kalender, Kontakte … für
Vergleiche, `AGENTS.md` „Apple-Vorlagen“) schickt man mit demselben Befehl,
nur mit Vorsatz `apple-`: `halobild apple-mail-kontextmenue-mailliste`. Die
Datei landet zunächst im Eingang; `tests/bilder-eingang.zsh` verschiebt
Bilder mit dem Vorsatz nach `~/halo-aufgaben/apple/` (ohne Vorsatz) und
ergänzt `apple/index.md` (Abschnitt 18). Im Gespräch „Apple-Vorlage: mail-kontextmenue-mailliste“
nennen. Eine eigene Funktion `haloapple` gibt es nicht.

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
  Rechte-Modus: `auto` wie die Cloud-Sitzungen (sonst bleiben Antworten an
  sie ohne Abfrage hängen), mit `HALO_RC_MODUS` im Skript änderbar. Was neon
  regelmäßig braucht (gh, git, Tests, Release, prlctl, `~/halo-aufgaben`,
  `~/halo-berichte`), steht als Allow-Regel in `~/.claude/settings.json`.
- Aus einer Cloud-Sitzung: `ListAgents` zeigt die Sitzung auf dem Mini,
  `SendMessage` an `neon` gibt ihr eine Aufgabe. Beim ersten Mal fragt die
  Claude-App einmalig, ob Cloud-Sitzungen die eigenen Rechner erreichen
  dürfen – nur auf einem vertrauenswürdigen Gerät bestätigen.
- Das Skript setzt `HALO_NEON=1`. Daran erkennt der SessionStart-Hook
  `tests/neon-hook.sh` (eingetragen in `.claude/settings.json`) die Sitzungen
  von neon und lädt bei Start und nach jedem Verdichten die Arbeitsweise und
  die offenen Aufträge aus `~/halo-aufgaben/neon-stand.md` (AGENTS.md
  „neon erreichen“, `docs/neon-sitzung.md`). Ohne die Variable erkennt er
  neon auf macOS am übergeordneten `claude remote-control`. Nach einer
  Änderung am Skript `tests/mac-mini-setup.sh` ausführen – es kopiert das
  Skript neu, startet laufende Sitzungen aber nicht neu (neu eingerichtet
  und gestartet wird der LaunchAgent nur, wenn seine plist fehlt oder
  abweicht); wirksam ab dem nächsten Start bzw. nach `launchctl kickstart -k`.
- Die Sitzung auf dem Mini arbeitet im Checkout `~/halo-spaces` mit allem,
  was der Mini hat (Thunderbird, Tests, Windows-VM, `gh project …`). Die
  Regeln für Testläufe (Abschnitt 7) gelten auch für sie.
- Neu starten: `launchctl kickstart -k gui/$(id -u)/at.halo-spaces.remote-control`;
  abschalten: `launchctl bootout gui/$(id -u)/at.halo-spaces.remote-control`
  und die plist in `~/Library/LaunchAgents/` löschen.
- **Fester Sitzungsname:** `--name` setzt nur den Namen der Verbindung (claude.ai/Desktop-App).
  Den lokalen Namen, den `ListAgents` zeigt und an den `SendMessage` geht, leitet Claude für die
  Kindprozesse sonst selbst ab (6.11.2026: `neon-board` hieß in `ListAgents` `halo-board-de`,
  Senden an `neon-board` scheiterte). Darum setzt `mac-remote-control.sh` vor dem Start
  `CLAUDE_CODE_SESSION_NAME=<Name>`; die Kindprozesse erben es (geprüft mit einem Probeprozess:
  `~/.claude/sessions/<pid>.json` zeigt den Namen). Wirkt ab dem nächsten Start des LaunchAgents
  (`kickstart -k`, nur wenn die Sitzung nichts tut; bei `neon` beendet das die laufende
  Sitzung, also nur zu einem passenden Zeitpunkt).

### Zweite Sitzung `neon-board` (nur Board und Bilder)

Neben `neon` hält ein zweiter LaunchAgent `at.halo-spaces.neon-board` eine
Remote-Control-Sitzung `neon-board` offen, die nur das Board bedient
(`board.sh`: lesen, anlegen, ergänzen, Status, archivieren, Doppelte prüfen)
und Bilder bzw. Apple-Vorlagen unter `~/halo-aufgaben/` speichert – nie
Tests, Builds, Thunderbird, Pushes oder Releases (AGENTS.md „neon
erreichen“). So bleibt das Board erreichbar, während neon testet.

Modell (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Die Sitzung läuft mit Sonnet und niedriger Reasoning-Stufe
(`"model": "sonnet"`, `"effortLevel": "low"` in der `.claude/settings.json`, die
`mac-remote-control.sh` bei jedem Start in `~/halo-board` neu schreibt;
Unteragenten ebenfalls Sonnet). Gilt ab dem nächsten Start von neon-board:
`mac-mini-setup.sh` kopiert das Skript, startet aber nichts neu; danach, wenn
neon-board nichts tut, `launchctl kickstart -k gui/$(id -u)/at.halo-spaces.neon-board`.
Gibt der Server der Sitzung beim Start ein eigenes Modell mit (`--model` am
Kindprozess von `claude remote-control`, `ps -o args= -p <pid>`), schlägt das
die Einstellungen; dann das Modell im Modellwähler der Sitzung in claude.ai/code
umstellen. Für die Sitzung `neon` selbst gilt das immer (`docs/neon-sitzung.md`, Modelle).

- Gleiches Skript wie neon (`~/.config/halo-spaces/remote-control.sh`), aber
  `HALO_RC_NAME=neon-board`, Arbeitsordner `~/halo-board` (kein Checkout),
  Protokoll `~/Library/Logs/halo-neon-board.log` (`HALO_RC_LOG`, rotiert wie
  bei neon), Modus `auto` wie neon. Bei jedem Start schreibt das Skript
  `~/halo-board/CLAUDE.md` (Rolle) und `~/halo-board/.claude/settings.json`
  (Rechte: `board.sh`, `neon-stand.sh`, `~/halo-aufgaben` erlaubt; Tests,
  Builds, Release, `git push`/`commit`, `prlctl`, `launchctl` gesperrt;
  SessionStart-Hook `~/.config/halo-spaces/neon-hook.sh`) – Änderungen daran
  im Skript, nicht im Ordner.
- Der Hook erkennt neon-board an `HALO_NEON=board`, an `--name neon-board`
  am übergeordneten `claude remote-control` oder am Ordner `~/halo-board`
  und lädt eigene kurze Hinweise und die offenen Aufträge aus
  `~/halo-aufgaben/board-stand.md` (`HALO_STAND_NAME=board neon-stand.sh …`).
- `aktive_sitzung()` in `tests/lauf-hilfen.zsh` übergeht den Projektordner
  `~/.claude/projects/…-halo-board`: neon-board hält Nachtlauf, Rundgang und
  Wochen-/Doku-Prüfung nie als „belegt“ auf.
- `tests/mac-mini-setup.sh` legt die Skripte beider Sitzungen
  (`mac-remote-control.sh` als `remote-control.sh`, `neon-hook.sh`,
  `board.sh`, `neon-stand.sh`) nach `~/.config/halo-spaces/` – nur
  geänderte, ohne laufende Sitzungen neu zu starten; die neue Fassung gilt
  ab deren nächstem Start (Entscheidung des Maintainers vom 6.11.2026,
  Sitzung global.design.comparison, Wortlaut: „ja selbst übernehmen“). Mit
  `--check` meldet es veraltete Kopien nur. Den LaunchAgent von neon-board
  richtet es nicht ein, es prüft ihn (plist, läuft, Prozess
  `remote-control --name neon-board`, Ordner freigegeben).
- Speicher: eine zweite Sitzung braucht etwa 0,3–0,5 GB, bei 16 GB
  unkritisch. Beim nächsten vollen Lauf mit VM (CI-Runde `mac` + `windows`)
  `memory_pressure` und `sysctl vm.swapusage` mitmessen und mit den Werten
  der Wochenprüfung vergleichen.

Einrichten (einmalig, im Testbenutzer, nachdem die Änderung auf `main` ist):

```bash
# 1. Skripte nach ~/.config/halo-spaces/ – legt mac-mini-setup.sh ab (nur
#    geänderte, ohne neon neu zu starten; gilt ab dessen nächstem Start)
cd ~/halo-spaces && git pull --ff-only && tests/mac-mini-setup.sh

# 2. Arbeitsordner anlegen und in Claude Code freigeben
mkdir -p ~/halo-board && cd ~/halo-board && claude   # „Trust this folder“, dann /exit

# 3. LaunchAgent anlegen
cat > ~/Library/LaunchAgents/at.halo-spaces.neon-board.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>at.halo-spaces.neon-board</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$HOME/.config/halo-spaces/remote-control.sh</string><string>$HOME/halo-board</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HALO_RC_NAME</key><string>neon-board</string>
    <key>HALO_RC_LOG</key><string>$HOME/Library/Logs/halo-neon-board.log</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/halo-neon-board.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/halo-neon-board.log</string>
</dict>
</plist>
EOF

# 4. starten und prüfen
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/at.halo-spaces.neon-board.plist
tail -3 ~/Library/Logs/halo-neon-board.log           # „Start: … als neon-board“
cd ~/halo-spaces && tests/mac-mini-setup.sh --check | grep -A1 neon-board
```

5. Aus einer Cloud-Sitzung `ListAgents` aufrufen: `neon-board` muss neben
   `neon` erscheinen; eine Probe-Nachricht („liste '^Kalender:'“) schicken.
   Fragt die Claude-App nach der Freigabe für eigene Rechner, nur auf einem
   vertrauenswürdigen Gerät bestätigen.

Neu starten: `launchctl kickstart -k gui/$(id -u)/at.halo-spaces.neon-board`;
abschalten: `launchctl bootout gui/$(id -u)/at.halo-spaces.neon-board` und
die plist löschen. Nach Änderungen an `mac-remote-control.sh`,
`neon-hook.sh`, `board.sh` oder `neon-stand.sh` `tests/mac-mini-setup.sh`
ausführen (`--check` meldet veraltete Kopien); wirksam beim nächsten Start
der Sitzung bzw. nach `launchctl kickstart -k …`.

### Kein täglicher Neustart von `neon`, `/clear` von Hand

Entscheidung des Maintainers (Cloud-Sitzung global.design.comparison,
6.11.2026), Wortlaut: „ja täglichen neustart nicht aktivieren. clear von hand.“ – Befund: `launchctl kickstart -k
gui/$(id -u)/at.halo-spaces.remote-control` setzt dieselbe Sitzung mit vollem
Verlauf fort (`--resume`, gleiche Sitzungs-ID), ein Neustart leert den Kontext
also nicht. Deshalb:

- `tests/neon-neustart.sh` bleibt als Vorlage liegen; der LaunchAgent
  `at.halo-spaces.neon-neustart` wird von `tests/mac-mini-setup.sh` nicht
  eingerichtet und bei `--check` nicht verlangt (nur ein Hinweis, falls er doch
  geladen ist).
- Der Maintainer leert den Kontext täglich selbst mit `/clear` in `neon`. Vorher
  fragt er mit `/bereit` (`.claude/commands/bereit.md`): neon prüft
  `neon-stand.md`, Hintergrundläufe, Unteragenten, Zusagen und offene
  Änderungen und antwortet „Frei für /clear“ oder „Nicht frei: …“ (`docs/neon-sitzung.md`). Offene Aufträge kommen nach `/clear` über den
  SessionStart-Hook zurück.
- Idee für später (Board „Ablauf: neon täglich frisch per Archivieren testen“,
  Wartet auf OK): Sitzung vor dem Neustart archivieren, damit Remote Control
  eine neue anlegt.

## 13. Nachtlauf

Jede Nacht um 01:30 arbeitet Claude Code auf dem Mini offene Einträge der
Aufgabenliste ab (Bugs vor Features) und veröffentlicht danach selbst nach
`AGENTS.md`, Abschnitt „Release“. Auftrag: `tests/nachtlauf-auftrag.md`,
Ablauf: `tests/nachtlauf.sh`.

Vorprüfung (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Nach dem Aktualisieren von Thunderbird (läuft immer) prüft
`nachtlauf_arbeit()` aus `tests/vorpruefung.zsh` ohne Claude, ob etwas zu tun ist:
machbare Board-Einträge (Status Todo oder In Progress, nicht „Wartet auf OK“),
nicht gepushte Commits, offene Änderungen im Checkout oder Änderungen an
`extension/`, `chrome/`, `icons/` seit dem letzten Release-Tag (`v*`). Ist nichts davon da,
schreibt der Lauf nur einen Bericht „übersprungen“ und die Zeile
`ÜBERSPRUNGEN nachtlauf <Grund>` (Protokoll und `~/halo-nacht/uebersprungen.log`),
ohne Push aufs iPhone. Im Zweifel (git oder gh nicht lesbar) läuft er. Scheitert ein Push
aufs iPhone (Sitzung `github.comm.routine` nicht gefunden o. ä.), schreibt `push()` in
`tests/lauf-hilfen.zsh` `PUSH-FEHLER <Routine> <Grund>` ins Protokoll und in
`~/halo-nacht/uebersprungen.log`; die Wochenprüfung zählt sie (Kennzahl `push_fehler`).

**Pausen mit Ablaufzeit** (Anweisung des Maintainers vom 7.11.2026, Anlass: `~/halo-tour/PAUSE`
gilt dauerhaft und hätte den Rundgang auch nächste Woche verhindert): `~/halo-nacht/pausen.txt`, eine
Zeile je Pause `<Routine> <bis ISO-Zeit mit Zone> <Grund>`, z. B.
`rundgang 2026-11-07T14:05+01:00 vom Maintainer ausgesetzt`; Routinen `nachtlauf`, `rundgang`,
`dokupruefung`, `wochenpruefung`, `github-komm`, `ci-waechter`, `bilder-eingang` oder `alle` (die Liste steht einmal in
`PAUSEN_ROUTINEN` in `tests/lauf-hilfen.zsh`). Das ist die **einzige** Pausen-Datei. Eintragen: `zsh -c 'source
~/.config/halo-spaces/lauf-hilfen.zsh; pause_setzen rundgang 2026-11-14T14:05+01:00 "Grund"'`. Jeder Lauf
fragt die Datei zu Beginn über `pause_start <Routine>` (abgelaufene Zeilen zählen nicht, bei mehreren
aktiven Zeilen gilt der späteste Ablauf) und schreibt bei einer Pause
`ÜBERSPRUNGEN <Routine> pausiert bis … – <Grund>` (Protokoll und `uebersprungen.log`, kein Push). Am Ende
des Nachtlaufs (auch bei Abbruch, Pause oder Überspringen) entfernt `pausen_aufraeumen` abgelaufene
Zeilen mit je einer Zeile `PAUSE ABGELAUFEN …` im Protokoll und in `uebersprungen.log`. Unlesbare Zeilen
(Tippfehler in Zeit, Zone oder Routine) werden nie gelöscht: sie gelten als nicht pausierend und werden
einmal je Lauf als `PAUSE UNLESBAR <Zeile> – Routine läuft trotzdem` gemeldet (Protokoll und
`uebersprungen.log`, kein Push); Leerzeilen und `#`-Zeilen zählen nicht. Probe:
`HALO_JETZT=<ISO-Zeit>` ersetzt die Uhr, `HALO_PAUSEN_DATEI` die Datei. Alte Dateien (`~/halo-nacht/PAUSE`,
`PAUSE-WOCHE`, `PAUSE-DOKU`, `~/halo-tour/PAUSE`) übernimmt `pause_start` beim nächsten Start jeder
Routine als Zeile mit Ablauf 2999-12-31 („migriert aus …“, Meldung `PAUSE MIGRIERT …`) und löscht sie; die
Wochenprüfung meldet solche Zeilen als „dauerhaft“ (Abschnitte 15 bis 17). Der CI-Wächter pausiert mit
(Routine `ci-waechter`, eine gleiche Meldung nur einmal, nicht bei `--nur`, `--trocken`, `--datei`).
Cloud-geplante Aufgaben (Triggers) gibt es nicht (`list_triggers` leer); eine neue müsste `pausen.txt`
selbst lesen. Prüfung: `zsh tests/pausen_test.zsh` (Einzelfälle, Uhr per `HALO_JETZT`) und
`zsh tests/pausen_check.sh` (zusätzlich Reste alter Dateien; läuft in der Doku-Prüfung). `push()` löst den Namen der Empfangssitzung vorher ohne Claude auf
(`tests/sitzung-finden.zsh`: gleicher Name, sonst alle Wörter des Namens, z. B. `comm.github.routine`
für `github.comm.routine`); ohne Treffer kein Claude-Aufruf, nur `PUSH-FEHLER`. Treffer stehen in
`~/halo-aufgaben/sitzungen.json`.
`touch ~/halo-nacht/IMMER` erzwingt den Lauf. Der Nachtlauf bleibt bei Opus.

Ablauf in der Nacht (seit 3.11.2026 mit der schnellen CI): Einträge
abarbeiten, je Eintrag nur die betroffenen Prüfungen (`--only`), ab 04:30
kein neuer Eintrag mehr; dann pushen und den CI-Lauf für genau diesen Commit
abwarten (`tests/ci-warten.sh`, etwa 50 Minuten, mit Dunkelmodus etwa 70:
erst Linux ~17, danach `mac` hell ~17 bzw. hell und dunkel ~35, `windows` ~19). Grün: Versionshinweise, `release.sh` (überspringt die Tests
dank grüner CI), `publish.sh`. Rot: kleine Ursache beheben oder den Commit
mit `git revert` zurücknehmen, erneut pushen und warten – höchstens zwei
Reparaturrunden, keine neue ab 07:30, sonst kein Release. Nach grüner CI
und Release arbeitet er vor 06:30 alle machbaren Einträge des Plans weiter ab
(Entscheidungen des Maintainers vom 5. und 8.11.2026, Wortlaut in
`ENTSCHEIDUNGEN.md`): je Eintrag nur `--only` lokal, grün committen, rot
zurück auf Todo; nicht pushen, kein zweites Release, höchstens sechs nicht
gepushte Commits (die der Vornacht zählen mit). Die Commits bleiben auf
`main` in `~/halo-spaces`, die Einträge In Progress mit Notiz „committet,
wartet auf Push/CI“; der nächste Nachtlauf pusht sie mit seiner CI-Runde.
Legt Claude die Fertig-Datei vor 06:30 an, prüft `nachtlauf.sh` mit
`nachtlauf_fortsetzen` (`tests/vorpruefung.zsh`, ohne Claude) das Board
(Todo/In Progress) und die Zahl der nicht gepushten Commits; gibt es Arbeit
unter der Grenze, verschiebt es die Fertig-Datei nach
`~/halo-nacht/<datum>-fertig-runde<n>.txt` und startet eine Runde „Schritt 5
fortsetzen“ (höchstens vier; eine Fortsetzung ohne neuen Commit beendet).
Endegründe nur: nichts Machbares mehr, 06:30 erreicht, Sechs-Commits-Grenze,
Limit, rote CI in Schritt 4 – Zeile „Grund: …“ der Fertig-Datei,
Protokollzeile „Arbeit beendet: …“, Abschnitt „Ende der Arbeit“ im Bericht.
Probe: `HALO_JETZT_HM`, `NACHT_GRENZE`, `NACHT_MAX_COMMITS`. Der Bericht nennt
die CI-Läufe mit ID, Ergebnis und Dauer je Job. Tagsüber committete, nicht
gepushte Commits auf `main` (Nicht Eiliges, AGENTS.md) pusht er mit – auch
in Nächten ohne eigene Einträge, dann ohne Release, außer es sind Bugs oder
Features darunter. Ebenso veröffentlicht er schon gepushte, aber noch nicht
veröffentlichte Bugs und Features anderer Sitzungen, wenn die CI dazu grün
ist (Entscheidung des Maintainers vom 5.11.2026).

**CI-Abschluss** (Entscheidung des Maintainers vom 7.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
Nach Claudes Arbeit – auch wenn die Vorprüfung nichts fand – ruft `nachtlauf.sh`
`ci_nacht_abschluss` aus `tests/ci-runde.zsh` (nur `gh`, kein Claude; Protokollzeile „Start
CI-Abschluss“, bis „Ende“ zählt das als Nachtfenster für den CI-Wächter):
noch laufende CI-Läufe der Nacht abwarten (bis 90 Minuten, längstens 09:00), rote Prüfungen
daraus mit `ci-waechter.sh --lauf <ID>` ins Board (`Tests: CI rot – <Job>: <Prüfung>`, offener
Eintrag zur selben Prüfung wird ergänzt; gezielte Läufe und `windows-github` nicht; eingetragene
Läufe in `~/halo-nacht/<datum>.ci-eingetragen`). Zeigt ein späterer Vollrunden-Lauf derselben Nacht
auf einem anderen Kopf-SHA (Reparaturcommit) dieselbe Prüfung im selben Job und Schritt (hell/dunkel)
grün, gilt sie als in derselben Nacht repariert (Entscheidung des Maintainers vom 7.11.2026,
`ci_reparatur` in `tests/ci-runde.zsh`): kein Eintrag, nur die Zeile „CI rot, in derselben Nacht
repariert: <Job>: <Prüfung> (rot: Lauf X, grün: Lauf Y, Commit Z)“ im Bericht; ein schon offener
Eintrag bekommt eine Notiz mit Commit und Lauf-IDs, Status Done und wird archiviert. Grün nur auf
demselben SHA (Wiederholung) heißt „flackert“: Eintrag wie bisher mit Notiz „flackert“. Bleibt die
Prüfung bis zum Ende der Nacht rot, wird sie wie bisher eingetragen. Lief in den letzten 24 Stunden keine Vollrunde
(abgeschlossen, nicht gezielt, alle Testjobs Linux Release/Beta/ESR, `mac`, `windows` gelaufen –
ein Release-Commit mit übersprungenen Jobs zählt nicht, auch wenn er „success“ meldet) und
hat der Nachtlauf nichts CI-Auslösendes gepusht, startet er vor 04:30 (Wiener Zeit)
`gh workflow run test.yml -f ziel=alle` (testet immer dunkel), findet den Lauf über
`--event workflow_dispatch --created '>=<Start>'` und den Kopf-SHA von `main` (kein oder mehrere
Treffer: Fehler), wartet bis 90 Minuten (längstens 09:00) und trägt Rotes ein. Pusht er
Code, kommt bei fälliger Vollrunde `[dunkel]` in die Commit-Nachricht (Hinweis „CI-Vollrunde:
fällig“ im Auftrag); seine Push-Runde ist dann die Vollrunde. Fehler in diesem Teil brechen nichts ab:
`VOLLRUNDE-FEHLER nachtlauf <Grund>` bzw. `EINTRAG-FEHLER nachtlauf <Grund>` in Protokoll und
`~/halo-nacht/uebersprungen.log`. Der Bericht bekommt den Abschnitt „CI-Runde der Nacht“ mit
„Letzte vollständig grüne Runde: <Datum, Wiener Zeit> (vor N Tagen)“ (grün: alle Testjobs
grün, dunkel nur, wenn die Runde dunkel testete). Probe: `nachtlauf.sh --trocken` (zeigt nur, was er
eintragen bzw. starten würde); Test ohne Netz `zsh tests/ci_runde_test.zsh` (`--echt`: zusätzlich
nur lesend gegen GitHub; läuft in der Doku-Prüfung).

- Einrichten bzw. nach Änderungen am Skript erneuern:
  `tests/mac-mini-setup.sh --ohne-probelauf` (LaunchAgent
  `at.halo-spaces.nachtlauf`, Skript mit `tests/lauf-hilfen.zsh` nach
  `~/.config/halo-spaces/` kopiert, Protokoll
  `~/Library/Logs/halo-nachtlauf.log`). Dasselbe richtet CI-Wächter,
  Wochenprüfung und Doku-Prüfung ein (Abschnitte 14–16). Claude Code darf den
  LaunchAgent nicht selbst laden (Sicherheitsprüfung) – der Befehl kommt vom
  Maintainer, in der Bildschirmsitzung oder per SSH.
- Erster erlaubter Tag: `HALO_NACHT_AB` im Skript (Standard 4.11.2026);
  davor endet jeder Start sofort, ohne Bericht.
- Vor dem Start prüft das Skript, ob schon etwas läuft: CI-Job (darauf wartet
  es bis 90 Minuten), `halo_test.py` und Verwandte, Thunderbird mit
  Marionette, belegte Ports 2839/2845/2850–2869, VM-Lauf, `release.sh`/
  `publish.sh`, eigener Lauf
  (`~/halo-nacht/lauf.lock`) und jede andere Claude-Sitzung, die gerade
  mitten in einer Runde am Repo arbeitet – erkennbar am letzten Eintrag ihres
  Gesprächs unter `~/.claude/projects/-Users-<name>-halo*/`: eine Eingabe,
  ein Werkzeugaufruf oder dessen Ergebnis, aber nicht die Schlussantwort.
  Fertige Sitzungen, die nur auf eine Antwort warten, zählen nicht; eine
  Runde, in der seit 2 Stunden nichts mehr geschrieben wurde (auch nicht von
  Unteragenten), gilt als hängengeblieben und zählt auch nicht. Ausgenommen
  sind die Sitzungen der eigenen Läufe und der Push-Zustellung. Dann wird
  ausgelassen – mit Bericht.
- Danach bringt er Thunderbird unter `/Applications` auf die aktuelle Version
  von Mozilla (`thunderbird_aktualisieren` in `tests/lauf-hilfen.zsh`: nur mit
  Mozillas Signatur, die alte App wird erst ersetzt, wenn die neue vollständig
  kopiert ist). So testet die CI-Runde der Nacht schon mit der Version, die die
  Nutzer bekommen; die Zeile steht im Protokoll und im Bericht. Die Windows-VM
  aktualisiert er nicht (Abschnitt 11).
- Liegengebliebene Änderungen nimmt er zuerst mit (Entscheidung des
  Maintainers vom 4.11.2026): ungespeicherte Änderungen im Checkout, an
  denen gerade keine Sitzung arbeitet, prüft und committet er (Rotes oder
  Halbfertiges auf einen Zweig `rest/<datum>`, nicht gepusht), dann gleicht er
  mit GitHub ab (`git fetch`, `git rebase origin/main`) und nimmt damit auch
  die tagsüber committeten, nicht gepushten Commits mit. Erst danach beginnen
  die Einträge der Aufgabenliste; der Bericht listet alles unter „Mitgenommen“.
- `claude -p` im Rechte-Modus `auto`; bei Limit nach 30 Minuten mit
  derselben Sitzung fortgesetzt, nach 08:00 nicht mehr, um 09:00 beendet.
  Protokoll und Ausgaben je Runde in `~/halo-nacht/`.
- Bericht immer in `~/halo-berichte/<datum>-nachtlauf.md` (erste Zeile
  „Kurz: …“); Release-Berichte von `publish.sh` daneben.
- Aufs iPhone: Das Skript lässt eine kurze `claude -p`-Sitzung die Zeile
  „PUSH: …“ per `SendMessage` an die Sitzung `github.comm.routine` schicken;
  die hat Remote Control und stellt sie als Push-Meldung der Claude-App zu
  (kein fremder Dienst). Testen: `~/.config/halo-spaces/nachtlauf.sh
  --push-test "Test"` – nur unter launchd bzw. in der Bildschirmsitzung, per
  SSH ist `claude -p` nicht angemeldet (Schlüsselbund).
- Pausieren: Zeile in `~/halo-nacht/pausen.txt` (Routine `nachtlauf`, siehe oben; Bericht „pausiert“),
  fortsetzen: Zeile löschen. Abschalten:
  `launchctl bootout gui/$(id -u)/at.halo-spaces.nachtlauf` und die plist in
  `~/Library/LaunchAgents/` löschen.

## 14. CI-Wächter

Alle 15 Minuten sieht `tests/ci-waechter.sh` (LaunchAgent
`at.halo-spaces.ci-waechter`, ohne Claude, nur `gh`) nach abgeschlossenen
Läufen von `test.yml` auf `main` seit dem zuletzt ausgewerteten (Stand:
`~/halo-aufgaben/ci-waechter.stand`, beim ersten Start der neueste Lauf –
Älteres wird nicht nachgemeldet).

- **Rot:** je gescheiterter Prüfung (Zeilen `FEHLER` im Log; ohne solche Zeile
  der abgebrochene Schritt) ein Bug im Board, Status Todo, Titel
  `Tests: CI rot – <Job>: <Prüfung>`. Dieselbe Prüfung in mehreren Jobs ergibt
  einen Eintrag; gibt es schon einen offenen Eintrag zur selben Prüfung, wird
  er ergänzt (Datum, Lauf, Commit). Dazu eine Zeile aufs iPhone über dieselbe
  `push()`-Funktion wie der Nachtlauf (`tests/lauf-hilfen.zsh`) – die Sitzung
  `github.comm.routine` ist dabei nur der Zustellweg, die Routine
  „GitHub-Kommunikation“ selbst bleibt unberührt.
- **Versuchsjobs:** Jobs mit `continue-on-error: true` in `test.yml` (derzeit
  `windows-github`) zählen nicht – kein Eintrag, keine Zeile aufs iPhone, auch
  nicht für ihre `KONSOLE`-/`PROTOKOLL`-Zeilen (Entscheidung des Maintainers
  vom 5.11.2026). Ihre roten Prüfungen sammelt ein Eintrag von Hand („Tests:
  windows-github stabilisieren“). Der Wächter liest dafür `test.yml` des
  jeweiligen Commits; fällt `continue-on-error` weg (Job ersetzt `windows`),
  zählt der Job wieder.
- **Läufe aus dem Nachtlauf:** überspringt er wie bisher (der Nachtlauf trägt sie selbst ein, Abschnitt
  13). Rote merkt er sich in `~/halo-aufgaben/ci-waechter.nachholen` und holt nach dem Ende des
  Nachtlaufs (Sperre `~/halo-nacht/lauf.lock` frei) die nach, die nicht in
  `~/halo-nacht/<datum>.ci-eingetragen` stehen – mit derselben Dublettenprüfung. `--lauf <ID>`
  endet mit Exitcode 3, wenn ein Eintrag scheiterte. In derselben Nacht Repariertes (Abschnitt 13,
  dieselbe Funktion `ci_reparatur`) trägt er auch beim Nachholen nicht ein; die Zeile „CI rot, in
  derselben Nacht repariert …“ hängt er an `~/halo-berichte/<datum>-nachtlauf.md` an, Flackerer
  protokolliert er als `flackert: …` in `~/halo-aufgaben/ci-waechter.log` (Wochenprüfung zählt sie).
- **Abgebrochen:** nur protokolliert. **Grün:** nur protokolliert.
- **Fehlerkonsole:** für jeden abgeschlossenen Lauf (grün, rot, abgebrochen;
  auch während Nachtlauf und Wochenprüfung) je Zeile `KONSOLE  …` im Log
  (Fehler aus halo.spaces in der Fehlerkonsole, siehe AGENTS.md „Bauen und
  testen“) ein Bug `Tests: Fehlerkonsole – <Meldung>`; derselbe Fehler aus
  mehreren Jobs ergibt einen Eintrag, ein offener zur selben Meldung wird
  ergänzt. Aufs iPhone nur, wenn ein neuer Eintrag entstand. Diese Fehler
  machen keinen Lauf rot und halten kein Release auf. Ebenso Zeilen
  `PROTOKOLL  …` (Fehlerprotokoll der Erweiterung) als
  `Tests: Fehlerprotokoll – <Meldung>`. Offene Einträge findet er über die
  Zeile `Schlüssel: <Meldung>` im Text wieder; ist das Board nicht lesbar,
  legt er nichts an. Ist ein Lauf (noch) nicht lesbar, bleibt der Stand
  stehen und er versucht es im nächsten Durchgang erneut (nach 4 Versuchen
  übersprungen, `~/halo-aufgaben/ci-waechter.versuche`). `--datei <Datei>`
  wertet nur die Zeilen einer Datei aus (so trägt `release.sh` die Zeilen
  des Update-Tests ein).
- Läufe, die während eines Nachtlaufs oder einer Wochenprüfung beginnen
  (Zeiten aus `~/halo-nacht/<datum>.log` bzw. `<datum>-woche.log`), lässt
  er aus – die warten selbst auf ihre CI und berichten darüber.
- Ein noch laufender Lauf hält die Auswertung an, bis er fertig ist.
- Protokoll: `~/halo-aufgaben/ci-waechter.log` (launchd-Ausgabe
  `~/Library/Logs/halo-ci-waechter.log`).
- Von Hand: `tests/ci-waechter.sh --trocken` (nur anzeigen, kein Board, kein
  Push, Stand bleibt), `--lauf <ID>` wertet genau einen Lauf aus, zusammen
  mit `--trocken` zum Ausprobieren an einem alten roten Lauf.
- Abschalten: `launchctl bootout gui/$(id -u)/at.halo-spaces.ci-waechter`.

`tests/ci-warten.sh [<commit>] [<minuten>]` (von Nachtlauf und Wochenprüfung
benutzt) wartet höchstens die angegebenen Minuten auf den CI-Lauf eines
Commits und meldet je Job Ergebnis und Dauer, bei Rot die gescheiterten
Prüfungen; Exitcode 0 grün, 1 rot, 2 läuft noch, 3 abgebrochen, 4 kein Lauf.

## 15. Wochenprüfung

Sonntags um 08:00 wertet Claude Code die letzten 7 Tage aus (LaunchAgent
`at.halo-spaces.wochenpruefung`, `tests/wochenpruefung.sh`, Auftrag
`tests/wochenpruefung-auftrag.md`; keine geplante Aufgabe der Desktop-App).

- Ausgewertet: CI-Läufe (Dauer je Job, rote und abgebrochene Läufe,
  gescheiterte Prüfungen, unzuverlässige Prüfungen = rot und grün ohne
  Codeänderung dazwischen), langsamste Prüfungen aus den Testausgaben,
  `~/halo-nacht/*.log` und `~/halo-berichte/*` (erledigte Einträge,
  Limit-Pausen, ausgelassene Nächte, Release lokal oder per CI,
  Store-Upload-Fehler), Protokoll des CI-Wächters, Durchsatz im Board.
- Übersprungene Läufe (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Zeilen `ÜBERSPRUNGEN <Routine> <Grund>` aus
  `~/halo-nacht/uebersprungen.log` (Nachtlauf, Rundgang, Doku-Prüfung,
  GitHub-Kommunikation) je Routine zählen; kein Fehler und keine „zu früh
  beendete“ Nacht, aber prüfen, ob zu oft (z. B. Vorprüfung zu streng, weil ein
  Eintrag liegenblieb). Kennzahl `uebersprungen` je Woche. Die Wochenprüfung
  selbst bleibt bei Opus.
- Fehlerkonsole und Fehlerprotokoll: ob die Meldungen der Woche
  zuverlässig ins Board kamen (Dubletten, verlorene Meldungen, „Wieder
  aufgetreten“, unlesbare Läufe des CI-Wächters, Dauer); eine Durchsicht
  des Codes in Runden (fertig nach drei Runden ohne Fund, höchstens fünf)
  nur, wenn sich der Code dazu in der Woche geändert hat oder die Zahlen
  ein Leck zeigen.
- Nachtlauf zu früh beendet: je Nacht, ob er früher aufgehört hat als
  möglich (vor 04:30, bzw. nach grüner CI vor 06:30), obwohl noch machbare
  Einträge im Board lagen (ungenutzte Minuten, Zahl der
  Einträge, Grund); dazu je Nacht die Minuten vom Ende der Arbeit bis 06:30
  (`ungenutzt_bis_0630_min`, Entscheidung des Maintainers vom 8.11.2026); in mindestens zwei Nächten der Woche eine
  Ablaufänderung am Nachtlauf-Auftrag (bzw. ein Vorschlag „Ablauf: Nachtlauf …“
  mit „Wartet auf OK“, wenn sie eine Entscheidung des Maintainers berührt).
- Kennzahl „Tage seit der letzten vollständig grünen Runde“ (Entscheidung des Maintainers vom
  7.11.2026): rechnet `wochenpruefung.sh` ohne Claude aus den letzten 100 Läufen
  (`tests/ci-runde.zsh`; alle Testjobs grün, ohne gezielte Läufe und `windows-github`) und gibt
  sie in den Auftrag; Felder `tage_seit_gruener_vollrunde` und `letzte_gruene_vollrunde`. Dazu
  `VOLLRUNDE-FEHLER`/`EINTRAG-FEHLER` aus `uebersprungen.log` (Kennzahl `ci_runde_fehler`).
- Kennzahlen je Woche in `~/halo-aufgaben/wochen-kennzahlen.json`, Vergleich
  zur Vorwoche im Bericht `~/halo-berichte/<datum>-wochenpruefung.md`
  (erste Zeile „Kurz: …“ geht aufs iPhone).
- Darf selbst: kleine Korrekturen an Prüfungen (Toleranzen, Wartebedingungen
  statt Pausen, Plattform-Abweichungen als Warnung), mit `--only` prüfen,
  committen, pushen, CI abwarten; kein Release. Abläufe verbessert sie
  ebenfalls selbst (Entscheidung des Maintainers vom 5.11.2026; Auftrag
  Abschnitt 3b): Nachtlauf, CI-Wächter, Aufträge, Workflow,
  `release.sh`/`publish.sh` außer der Sperre – nur mit Beleg aus den Zahlen,
  höchstens drei je Woche, je mit Kennzahl und Ziel in
  `~/halo-aufgaben/ablauf-aenderungen.json`. Jede Woche prüft sie, ob die
  Änderungen der Vorwochen gewirkt haben, und nimmt Unwirksames mit
  `git revert` zurück. Nur als „Wartet auf OK“: was Entscheidungen des
  Maintainers ändert, Zeitpläne, LaunchAgents, `mac-mini-setup.sh`, neue
  Routinen, Kostensteigerungen. Nie: Release-Sperre, `if:`-Bedingungen der
  Mac-Jobs, `mac-runner-hook.sh`, Freigaberegeln.
- Läuft um 08:00 noch der Nachtlauf (`~/halo-nacht/lauf.lock`), wartet sie
  bis höchstens 09:15 und wertet ihn mit aus.
- Wie der Nachtlauf: Sperre `~/halo-nacht/woche.lock`, wartet bis 90 Minuten
  auf einen CI-Lauf und lässt sonst aus, wenn etwas läuft oder verfolgte
  Dateien im Repo ungespeicherte Änderungen haben (Bericht
  „ausgelassen“); `claude -p` im Modus `auto`, nach Limit 30 Minuten Pause
  und Fortsetzen, nach 6 Stunden kein Fortsetzen mehr, nach 7 beendet.
  Protokoll `~/halo-nacht/<datum>-woche.log`.
- Pausieren: Zeile für `wochenpruefung` in `~/halo-nacht/pausen.txt` (Abschnitt 13), fortsetzen: Zeile löschen.
- Probelauf: `~/.config/halo-spaces/wochenpruefung.sh --trocken` – nur
  auswerten und Bericht, keine Änderungen, kein Board, keine Kennzahlen-Datei.
  Wie beim Nachtlauf nur unter launchd bzw. in der Bildschirmsitzung (per SSH
  ist `claude -p` nicht angemeldet), z. B. im Terminal am Bildschirm oder
  per Bildschirmfreigabe.

## 16. Doku-Prüfung

Samstags um 08:00 prüft Claude Code alle `.md`-Dateien des Repos – wie die
Wochenprüfung die Läufe (LaunchAgent `at.halo-spaces.dokupruefung`,
`tests/wochenpruefung.sh --doku`, Auftrag `tests/dokupruefung-auftrag.md`;
keine geplante Aufgabe der Desktop-App).

- Geprüft: Widersprüche (in einer Datei und zwischen den Dateien), Abgleich
  mit dem Stand des Repos (Pfade, Dateilisten, Abschnittsverweise, Zeiten,
  Ports, Befehle, Zahlen), Veraltetes, Doppeltes, Unklares, Lücken.
- Kennzahlen je Woche in `~/halo-aufgaben/doku-kennzahlen.json`, Bericht
  `~/halo-berichte/<datum>-dokupruefung.md` (erste Zeile „Kurz: …“ geht aufs
  iPhone).
- Darf selbst: Fakten an den Code angleichen, eindeutig Veraltetes
  anpassen, Doppeltes in einer Datei zusammenführen, Unklares eindeutig
  formulieren (höchstens zehn Korrekturen), nur in `.md`-Dateien, und
  pushen, wenn sonst nichts Ungepushtes auf `main` liegt (reine
  `.md`-Pushes starten keine CI). Echte Widersprüche, inhaltliche
  Regeländerungen und `store/*.md` nur als Board-Eintrag „Doku: …“ mit
  Status „Wartet auf OK“. Nie: Entscheidungen des Maintainers,
  Freigaberegeln, Release-Sperre, Versionshinweise, Skripte, Workflows.
- Wartet wie die Wochenprüfung bis höchstens 09:15 auf den Nachtlauf; CI,
  Testläufe und VM stören sie nicht (sie testet nichts), andere Sitzungen
  am Repo, ungespeicherte Änderungen an verfolgten Dateien und
  `release.sh`/`publish.sh` schon (dann „ausgelassen“). Sperre
  `~/halo-nacht/doku.lock`, Protokoll `~/halo-nacht/<datum>-doku.log`,
  Zeitgrenzen wie Abschnitt 15.
- Vorprüfung und Modell (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“; Ergänzung vom selben Tag, Wortlaut: „nein die doku prüfung soll auch widersprüche sehen“, Umsetzung = Deutung der Sitzung global.design.comparison): Die Prüfung sieht nicht nur Geändertes, sondern auch Widersprüche. Stand: Commit in `~/halo-aufgaben/doku-pruefung.stand` (nach jeder fertigen Prüfung neu, ohne Stand Vollprüfung).
  1. Geänderte `.md` seit dem Stand gründlich, dazu Abgleich gegen alle anderen `.md` auf Widersprüche und Doppeltes (die übrigen nicht Absatz für Absatz).
  2. `.md`, die ein geändertes Skript beschreiben, ebenfalls gründlich, auch unverändert. Regel: geändert sind `*.sh`, `*.zsh`, `*.py` und `.github/workflows/*`; die `.md` „beschreibt“ sie, wenn der Dateiname im Text vorkommt. `extension/` und `chrome/` zählen nicht (sie ändern sich täglich).
  3. Vollprüfung aller `.md` am ersten Samstag im Monat oder wenn `~/halo-nacht/DOKU-VOLL` existiert (der Lauf löscht sie danach).
  4. Nur wenn nichts davon zutrifft: `ÜBERSPRUNGEN dokupruefung …` ohne Claude und ohne Push.

  Sonnet, `--effort low` (Vollprüfung `--effort medium`).
- Pausieren: Zeile für `dokupruefung` in `~/halo-nacht/pausen.txt` (Abschnitt 13), fortsetzen: Zeile löschen.
- Probelauf: `~/.config/halo-spaces/wochenpruefung.sh --doku --trocken` –
  nur auswerten und Bericht; Einschränkungen wie Abschnitt 15.

## 17. Design-Rundgang

Samstags um 10:00 nimmt der Mac alle Oberflächen auf, misst sie und vergleicht
mit dem Rundgang der Vorwoche (Entscheidung des Maintainers vom 5.11.2026;
LaunchAgent `at.halo-spaces.rundgang`, `tests/rundgang-woche.sh`, Auftrag
`tests/rundgang-auftrag.md`). Ziel: Rückschritte und neue Ausreißer bei
Popups, Panels, Dialogen, Knöpfen, Suchfeldern, Symbolen und im Dunkelmodus,
die `halo_test.py` nicht sieht.

- Wartet, bis neon frei ist: Nachtlauf, Wochen- und Doku-Prüfung, CI,
  Testläufe, VM, andere Sitzungen in einer Runde (`belegt()` aus
  `lauf-hilfen.zsh`). Spätester Start 14:00, sonst ausgelassen (Meldung aufs
  iPhone).
- Baut `origin/main` in einem eigenen Checkout `~/halo-tour/stand` (nicht in
  `~/halo-spaces`) und ruft `tests/ui_tour.py --messung` auf: immer hell,
  dunkel nur, wenn `tests/farben-betroffen.sh <Commit des vorigen
  Rundgangs> HEAD` Farben meldet (beim ersten Lauf beide). Ports 2853/2854.
- Ablage `~/halo-tour/<datum>/`: Bilder, `<hell|dunkel>-ergebnis.json`,
  `<hell|dunkel>-messung.json`, `commit.txt`, `vergleich.md/json`
  (`tests/rundgang_vergleich.py`: Ausreißer gegen den häufigsten Wert je
  Kategorie, Suchfelder mit Hover oder ohne Kapsel, neue/behobene/geänderte
  Ausreißer gegen die Vorwoche, neu nicht erreichte Oberflächen, neue
  Original-Symbole; Bilder nur zur Information). Nach 8 Wochen werden Bilder
  und Logs gelöscht, die JSON-Dateien bleiben.
- Danach wertet Claude (`claude -p`) den Vergleich aus: neue Ausreißer als
  Bug ins Board (außer Entscheidungen des Maintainers und „Wartet auf OK“),
  Done-Einträge bestätigen bzw. Rückschritte melden, Bericht
  `~/halo-berichte/<datum>-rundgang.md`, Ergebnisseite (private
  Artifact-Seite) aktualisieren, Kurzfassung aufs iPhone.
- Kennzahlen je Lauf in `~/halo-aufgaben/rundgang-kennzahlen.json` (Status,
  Dauer, OK/nicht erreicht, Ausreißer neu/behoben/gesamt); die
  Wochenprüfung wertet sie mit aus. Protokoll `~/halo-nacht/<datum>-rundgang.log`,
  Sperre `~/halo-nacht/rundgang.lock`.
- **Bildschirmaufnahme:** Popups nimmt `ui_tour.py` mit `screencapture -l`
  auf. Der LaunchAgent startet `/bin/zsh`; dieses braucht unter Datenschutz &
  Sicherheit → Bildschirm- & Systemaudioaufnahme einen Eintrag (eingerichtet
  am 5.11.2026). Jeder Lauf schreibt das Ergebnis nach
  `~/halo-tour/bildschirmaufnahme.txt`, `mac-mini-setup.sh --check` zeigt es.
- Vorprüfung und Modell (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Claude wertet nur, wenn `vergleich.json` neue oder
  geänderte Ausreißer, neu nicht erreichte Oberflächen oder neue Original-Symbole
  zeigt (oder kein Vergleich möglich war, z. B. erster Lauf, neues Farbschema).
  Sonst Bericht „übersprungen“, `ÜBERSPRUNGEN rundgang …`, Kennzahl
  `uebersprungen`, kein Push. Die Auswertung läuft mit Sonnet, niedrige
  Reasoning-Stufe.
- Pausieren: Zeile für `rundgang` in `~/halo-nacht/pausen.txt` (Abschnitt 13), fortsetzen: Zeile löschen.
- Probelauf von Hand (lokaler Stand, ohne Claude, wartet nur auf CI und
  Testläufe, Ablage `~/halo-tour/<datum>-probe`):
  `~/.config/halo-spaces/rundgang-woche.sh --only <id>,<id> ~/halo-spaces`.
  Unter launchd: `launchctl submit -l at.halo-spaces.rundgang-probe -- /bin/zsh
  ~/.config/halo-spaces/rundgang-woche.sh --only … ~/halo-spaces` und nach dem
  Lauf `launchctl remove at.halo-spaces.rundgang-probe` – `submit` startet den
  Auftrag nach dem Ende neu, bis er entfernt ist.

## 17a. GitHub-Kommunikation: Vorprüfung (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“)

Die geplante Aufgabe `halo-github-kommunikation` gehört der Claude-Desktop-App
(Datei `~/.claude/scheduled-tasks/halo-github-kommunikation/SKILL.md`), nicht dem
Repo. Das Repo liefert nur `tests/github-vorpruefung.sh` (liegt nach
`mac-mini-setup.sh` in `~/.config/halo-spaces/`): ohne Claude nur `gh`, Neues von
anderen als sruf79 seit „Letzte Prüfung“ in `~/halo-aufgaben/github-komm-stand.md`
(neue Issues/PRs, neue Kommentare und Reviews, neue oder gepushte Forks). Ausgabe
`NICHTS NEU …` (Exitcode 0, schreibt `ÜBERSPRUNGEN github-kommunikation …` nach
`~/halo-nacht/uebersprungen.log`) oder `NEU …` mit den Funden (Exitcode 1), bei
Lesefehlern `NEU (Prüfung nicht möglich …)` (Exitcode 2). `--trocken` schreibt
nichts ins Protokoll. Wirkt erst, wenn der Maintainer die Aufgabe umstellt:

1. In der Desktop-App die Aufgabe „halo.spaces: GitHub-Kommunikation“ öffnen und
   in den Einstellungen das Modell auf Sonnet stellen (falls der Dialog eine
   Modellwahl bietet; sonst bleibt es beim bisherigen Modell).
2. Den Prompt ändern: unter „0. Vorbereitung“ als erster Punkt einfügen:
   „Führe zuerst `zsh ~/.config/halo-spaces/github-vorpruefung.sh` aus. Beginnt die
   Ausgabe mit `NICHTS NEU` (Exitcode 0), antworte nur mit einer Zeile ‚GitHub
   <Uhrzeit>: nichts neu‘ und beende die Prüfung ohne Push, ohne Stand zu ändern.
   Sonst (`NEU`) normal weiter; die Funde sind die Ausgangsliste.“
3. Das Schreiben des Stands bleibt wie bisher: Nur eine echte Prüfung setzt „Letzte
   Prüfung“, eine übersprungene lässt sie stehen, so geht nichts verloren.

Die Sitzung startet weiterhin dreimal täglich, ist bei „nichts neu“ aber nach einem
Befehl fertig (ein kurzer Lauf statt der vollen Prüfung); ganz ohne Sitzung ginge nur
ein eigener LaunchAgent, der die Aufgabe bei `NEU` startet (neue Routine, nur auf
Wunsch).

## 18. Bilder-Eingang

Alle 15 Minuten sortiert `tests/bilder-eingang.zsh` (LaunchAgent
`at.halo-spaces.bilder-eingang`, ohne eigene Sitzung wie der CI-Wächter; nur
`cp`/`mv`, `shasum`, `sips`, belegt neon nicht) die Bilder aus
`~/halo-aufgaben/eingang/` ein (Auftrag des Maintainers vom 7.11.2026):

- **Namen:** klein, Ziffern und Bindestriche, Endung `.png`. `apple-<rest>.png`
  → `~/halo-aufgaben/apple/<rest>.png`, alles andere →
  `~/halo-aufgaben/bilder/<name>.png`. Ungültige Namen und nicht lesbare Bilder
  bleiben im Eingang (Protokoll, einmal Push aufs iPhone). Dateien, die jünger
  als 1 Minute sind, warten auf den nächsten Lauf (Übertragung läuft noch).
- **Unverändert:** SHA-256 im Eingang, nach dem Kopieren und im Ziel müssen
  gleich sein, erst dann wird der Eingang geleert. Gleicher Name ersetzt die
  ältere Fassung (Indexzeile mit neuem Datum und Hash, Beschreibung wieder
  „unbeschrieben“); gleicher Hash leert nur den Eingang.
- **Index:** `apple/index.md` (Name, App, macOS, Inhalt, ui_tour-ids, Datum,
  SHA-256; bestehende Zeilen bleiben, außer beim Ersetzen derselben Datei) und
  `bilder/index.md` (Name, Datum, SHA-256, Pixel, Beschreibung; neu seit
  7.11.2026, ältere Bilder stehen nicht darin). Das Skript füllt Name, Datum,
  Hash und Größe, alles andere steht als „unbeschrieben“.
- **Zu klein:** Fläche unter 4096 Pixel (weniger als 64×64) oder eine Kante
  unter 32 Pixel → „Bild unzureichend: nur B×H px“ in der Zeile, Push. Die
  Schwelle trifft nur offensichtlich Unbrauchbares; kleine Ausschnitte sind
  erlaubt (`docs/board.md`), ob Details erkennbar sind, beurteilt Claude.
- **bilder-offen.md:** passt der Name (ohne Vorsatz `apple-`) genau zur ersten
  Spalte einer offenen Zeile, wird sie ausgetragen („Erledigt (ausgetragen): …
  automatisch einsortiert“); zu kleine Bilder nicht. Passt er nur teilweise
  (z. B. `…-dunkel` zu einer Zeile „hell + dunkel“), steht `TEILWEISE …` im
  Protokoll und die Zeile bleibt.
- **Claude nur bei Arbeit** (wie `tests/vorpruefung.zsh`): stehen Zeilen mit
  „unbeschrieben“ in einem Index, beschreibt `claude -p --model sonnet --effort
  low --permission-mode dontAsk` (Werkzeuge Read, Grep, Glob, Edit nur an
  `apple/index.md` und `bilder/index.md`; Arbeitsordner
  `~/.cache/halo-bilder-eingang`, zählt so nie als Sitzung am Repo) nur diese
  Felder, bei `apple/` mit passenden ids aus `tests/ui_tour.py`, und meldet
  zu schwache Bilder („SCHWACH: …“ → Push). Höchstens 2 Versuche je Bild
  (`~/halo-aufgaben/bilder-eingang.versuche`), danach einmal Push. Sonst
  `ÜBERSPRUNGEN bilder-eingang <Grund>` (Protokoll und
  `~/halo-nacht/uebersprungen.log`, eine gleiche Zeile nur einmal
  hintereinander), kein Push. Schon gemeldete Probleme stehen in
  `~/halo-aufgaben/bilder-eingang.gemeldet` und werden nicht wiederholt.
- **Läuft nicht**, solange jemand anderes dieselben Dateien bearbeitet: Pause
  (Routine `bilder-eingang` in `~/halo-nacht/pausen.txt`, Abschnitt 13), ein
  noch laufender eigener Lauf, eine Sitzungssperre
  `~/halo-aufgaben/bilder-eingang.sperre` (Sitzungen, die von Hand in
  `bilder/` oder `apple/` arbeiten, legen sie mit `touch` an und löschen sie
  danach; älter als 2 Stunden zählt sie nicht) oder eine Änderung an
  `bilder/`, `apple/` oder `bilder-offen.md` in den letzten 3 Minuten, die
  nicht vom Skript selbst stammt.
- Protokoll `~/halo-aufgaben/bilder-eingang.log` (launchd-Ausgabe
  `~/Library/Logs/halo-bilder-eingang.log`). Skript, `lauf-hilfen.zsh` und
  `sitzung-finden.zsh` liegen wie beim CI-Wächter in `~/.config/halo-spaces/`
  (`tests/mac-mini-setup.sh` kopiert sie und richtet den LaunchAgent ein).
- **Einschalten** (nur der Maintainer): `launchctl bootstrap gui/$(id -u)
  ~/Library/LaunchAgents/at.halo-spaces.bilder-eingang.plist`, dazu auf dem
  Laptop `halobild` auf das neue Ziel umstellen (Abschnitt 10). Abschalten:
  `launchctl bootout gui/$(id -u)/at.halo-spaces.bilder-eingang`.
- Prüfung ohne Claude und ohne Push im Wegwerf-Ordner:
  `zsh tests/bilder_eingang_test.zsh` (läuft in der Doku-Prüfung). Zum Proben
  am echten Ordner: `HALO_BILDER_CLAUDE=trocken HALO_BILDER_PUSH=aus
  ~/.config/halo-spaces/bilder-eingang.zsh`.
