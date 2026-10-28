#!/bin/zsh
# Richtet einen Mac mini als Testrechner für halo.spaces ein und prüft ihn
# (Anleitung: tests/MAC-MINI.md). Im Testbenutzer ausführen, beliebig oft –
# Erledigtes bleibt, wie es ist.
#   tests/mac-mini-setup.sh                      prüfen, einrichten was ohne Passwort geht, Probelauf
#   tests/mac-mini-setup.sh --check              nur prüfen, nichts ändern (ohne Probelauf; Windows-VM nur, wenn sie läuft)
#   tests/mac-mini-setup.sh --check --probelauf  nur prüfen, mit Probelauf
#   --port N                                     Marionette-Port für den Probelauf (Standard 2850)
# Was ein Passwort oder einen Klick braucht, ändert das Skript nicht selbst:
# Es nennt den Befehl bzw. die Stelle in den Systemeinstellungen (Zeilen mit →).
# Ausgabe: eine Zeile je Punkt (OK / OFFEN / HINWEIS), Rückgabewert 0 nur ohne OFFEN.
emulate -L zsh
setopt pipefail
autoload -Uz is-at-least

ROOT="${0:A:h:h}"
CHECK=0
PROBE=""
PORT=2850
ME=$(id -un)
MOZILLA_TEAM=43AQ936H96                              # Signatur von Mozilla (wie tests/beta.sh)
TB_APP=/Applications/Thunderbird.app
RUNNER="${HALO_RUNNER_DIR:-$HOME/actions-runner}"
HOOK_ZIEL="$HOME/.config/halo-spaces/runner-hook.sh"  # außerhalb des Checkouts, den Jobs überschreiben
MIN_B=1600 MIN_H=1000                                # Testfenster 1500×900 plus Rand

while (( $# )); do
  case $1 in
    --check) CHECK=1 ;;
    --probelauf) PROBE=1 ;;
    --ohne-probelauf) PROBE=0 ;;
    --port) shift; PORT=$1 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print -u2 "Unbekannte Option: $1 (Hilfe: --help)"; exit 2 ;;
  esac
  shift
done
[[ -n $PROBE ]] || PROBE=$(( ! CHECK ))
[[ $PORT == <1024-65535> ]] || { print -u2 "Ungültiger Port: $PORT"; exit 2 }
[[ $(uname) == Darwin ]] || { print -u2 "Nur für macOS."; exit 2 }

OFFEN=0
ok()      { print -r -- "OK       $1${2:+ – $2}" }
offen()   { print -r -- "OFFEN    $1${2:+ – $2}"; OFFEN=$(( OFFEN + 1 )) }
hinweis() { print -r -- "HINWEIS  $1${2:+ – $2}" }
tun()     { print -r -- "         → $*" }

# Programm, dem macOS Rechte wie die Bildschirmaufnahme zuordnet: per SSH
# sshd-keygen-wrapper, im GitHub-Runner dessen Programm, sonst die äußerste App
# über dieser Shell (Terminal, iTerm, Claude …)
verantwortlich() {
  [[ -n $SSH_CONNECTION ]] && { print -r -- "SSH (sshd-keygen-wrapper)"; return }
  local pid=$$ comm app=""
  while (( pid > 1 )); do
    comm=$(ps -o comm= -p $pid 2>/dev/null) || break
    case $comm in
      */Runner.Listener|*/Runner.Worker) print -r -- "GitHub-Runner ($comm)"; return ;;
      *.app/*) app=${comm%%.app/*}.app ;;
    esac
    pid=$(ps -o ppid= -p $pid 2>/dev/null | tr -d ' ')
    [[ -n $pid ]] || break
  done
  print -r -- "${${app:t}:-unbekannt}"
}

# Bildschirmaufnahme: Erlaubnis abfragen (ohne Rückfrage), anfragen, oder
# Probeaufnahme NUR eines eigenen Fensters (Magenta) und Farbe in der Mitte prüfen
PROBE_JS='
ObjC.import("Cocoa");
ObjC.bindFunction("CGPreflightScreenCaptureAccess", ["bool", []]);
ObjC.bindFunction("CGRequestScreenCaptureAccess", ["bool", []]);
function run(argv) {
  if (argv[0] == "erlaubt") return $.CGPreflightScreenCaptureAccess() ? "ja" : "nein";
  if (argv[0] == "anfragen") return $.CGRequestScreenCaptureAccess() ? "ja" : "nein";
  $.NSApplication.sharedApplication.setActivationPolicy(1);  // ohne Dock-Symbol, ohne Fokus
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(60, 60, 260, 160), 1, 2, false);
  win.setTitle("halo.spaces – Probeaufnahme");
  win.setBackgroundColor($.NSColor.colorWithSRGBRedGreenBlueAlpha(1, 0, 1, 1));
  win.orderFrontRegardless;
  win.display;
  $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.6));
  const task = $.NSTask.alloc.init;
  task.launchPath = "/usr/sbin/screencapture";
  task.arguments = $(["-x", "-o", "-l", String(win.windowNumber), argv[1]]);
  task.launch;
  task.waitUntilExit;
  win.orderOut(null);
  if (task.terminationStatus != 0) return "screencapture fehlgeschlagen";
  const rep = $.NSBitmapImageRep.imageRepWithContentsOfFile(argv[1]);
  if (rep.isNil()) return "kein Bild entstanden";
  const c = rep.colorAtXY(Math.floor(rep.pixelsWide / 2), Math.floor(rep.pixelsHigh / 2)).colorUsingColorSpace($.NSColorSpace.sRGBColorSpace);
  const r = c.redComponent, g = c.greenComponent, b = c.blueComponent;
  // Magenta kommt je nach Farbprofil etwas blasser an – Rot und Blau müssen deutlich über Grün liegen
  return (r > 0.7 && b > 0.7 && g < r - 0.3 && g < b - 0.3) ? "ok" : "Bild zeigt nicht das Probefenster (" + [r, g, b].map(x => x.toFixed(2)).join(" ") + ")";
}'

pruefe_verwaltung() {
  local st admins
  st=$(profiles status -type enrollment 2>/dev/null)
  if [[ $st == *"MDM enrollment: Yes"* || $st == *"Enrolled via DEP: Yes"* ]]; then
    hinweis "Verwaltung" "der Mac ist per MDM bei einer IT angemeldet"
    tun "automatische Anmeldung, FileVault, Rechte (Bildschirmaufnahme) und VPN-Programme wie Tailscale können durch die Verwaltung gesperrt sein – dann mit der IT klären"
  elif [[ -n $st ]]; then
    ok "Verwaltung" "nicht per MDM verwaltet"
  else
    hinweis "Verwaltung" "unbekannt (profiles status lieferte nichts)"
  fi
  admins=(${${(z)$(dscl . -read /Groups/admin GroupMembership 2>/dev/null)}[2,-1]})
  admins=(${admins:#root})
  admins=(${admins:#$ME})
  (( $#admins )) && hinweis "Verwaltung" "Administratorkonten: ${(j:, :)admins} – gehört eines der IT, ist der Mac vermutlich verwaltet"
}

pruefe_benutzer() {
  local profile=(~/Library/Thunderbird/Profiles/*/prefs.js(N))
  if (( $#profile )) && grep -qE '"mail\.server\.[^"]+\.type", "(imap|pop3|nntp|ews|owl|graph)"' $profile 2>/dev/null; then
    offen "Testbenutzer" "$ME hat Thunderbird-Profile mit Mailkonten"
    tun "Tests in einem eigenen Benutzer ohne echte Mails laufen lassen (tests/MAC-MINI.md, Abschnitt 2)"
  else
    ok "Testbenutzer" "$ME, keine Thunderbird-Mailkonten"
  fi
  id -Gn | tr ' ' '\n' | grep -qx admin && hinweis "Testbenutzer" "$ME ist Administrator – für den Dauerbetrieb genügt ein Standardbenutzer"
}

# pmset-Minuten lesbar: 0 heißt nie
dauer() { [[ $1 == 0 ]] && print nie || print "nach ${1:-?} min" }

pruefe_ruhezustand() {
  local g sl ds ar idle lock
  g=$(pmset -g 2>/dev/null)
  sl=$(awk '$1 == "sleep" { print $2 }' <<<$g)
  ds=$(awk '$1 == "displaysleep" { print $2 }' <<<$g)
  ar=$(awk '$1 == "autorestart" { print $2 }' <<<$g)
  if [[ $sl == 0 && $ds == 0 ]]; then
    ok "Ruhezustand" "aus (Rechner und Bildschirm schlafen nie)"
  else
    offen "Ruhezustand" "Rechner schläft $(dauer $sl), Bildschirm $(dauer $ds)"
    tun "als Administrator: sudo pmset -a sleep 0 displaysleep 0 disksleep 0 womp 1 autorestart 1"
  fi
  if [[ $ar == 0 ]]; then
    hinweis "Ruhezustand" "nach einem Stromausfall startet der Mac nicht von selbst"
    tun "als Administrator: sudo pmset -a autorestart 1"
  fi

  idle=$(defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null)
  if [[ $idle == 0 ]]; then
    ok "Bildschirmschoner" "aus"
  elif (( CHECK )); then
    offen "Bildschirmschoner" "$([[ -n $idle ]] && print "startet nach $idle s" || print "nicht ausgeschaltet")"
    tun "defaults -currentHost write com.apple.screensaver idleTime -int 0"
  elif defaults -currentHost write com.apple.screensaver idleTime -int 0; then
    ok "Bildschirmschoner" "ausgeschaltet"
  else
    offen "Bildschirmschoner" "ließ sich nicht ausschalten"
  fi

  lock=$(sysadminctl -screenLock status 2>&1 | tail -1)
  lock=${lock#*\] }
  if [[ $lock == *off* ]]; then
    ok "Bildschirmsperre" "aus"
  else
    hinweis "Bildschirmsperre" "${lock:-Status unbekannt} – stört nur, wenn der Bildschirm doch schläft"
    tun "sysadminctl -screenLock off -password -   (fragt nach dem Passwort von $ME)"
  fi
}

thunderbird_installieren() {
  local tmp rc=1
  tmp=$(mktemp -d) || return 1
  print "         Lade Thunderbird …"
  if curl -sSfL -o "$tmp/tb.dmg" "https://download.mozilla.org/?product=thunderbird-latest-SSL&os=osx&lang=en-US" &&
     mkdir "$tmp/mnt" && hdiutil attach -nobrowse -readonly -quiet -mountpoint "$tmp/mnt" "$tmp/tb.dmg"; then
    # nur von Mozilla signierte Programme übernehmen
    if codesign --verify --deep --strict "$tmp/mnt/Thunderbird.app" &&
       [[ $(codesign -dv "$tmp/mnt/Thunderbird.app" 2>&1 | sed -n 's/^TeamIdentifier=//p') == $MOZILLA_TEAM ]]; then
      rm -rf "$TB_APP" && ditto "$tmp/mnt/Thunderbird.app" "$TB_APP" && rc=0
    else
      print "         Signatur ist nicht von Mozilla – nicht übernommen"
    fi
    hdiutil detach -quiet "$tmp/mnt"
  fi
  rm -rf "$tmp"
  return $rc
}

pruefe_thunderbird() {
  local v neu team grund=""
  neu=$(curl -sSf -m 10 https://product-details.mozilla.org/1.0/thunderbird_versions.json 2>/dev/null |
        sed -n 's/.*"LATEST_THUNDERBIRD_VERSION": *"\([^"]*\)".*/\1/p')
  if [[ -d $TB_APP ]]; then
    v=$(defaults read "$TB_APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null)
    team=$(codesign -dv "$TB_APP" 2>&1 | sed -n 's/^TeamIdentifier=//p')
    if [[ $team != $MOZILLA_TEAM ]]; then
      grund="$TB_APP ist nicht von Mozilla signiert"
    elif ! is-at-least 128 ${v:-0}; then
      grund="Version ${v:-?} – halo.spaces braucht 128 oder neuer"
    elif [[ -n $neu ]] && ! is-at-least $neu $v; then
      grund="Version $v, aktuell ist $neu"
    else
      ok "Thunderbird" "$v unter /Applications${neu:+ (aktuell: $neu)}"
      return
    fi
  else
    grund="nicht unter /Applications"
  fi
  if (( ! CHECK )) && [[ -w /Applications ]] && ! pgrep -f "$TB_APP/Contents/MacOS/thunderbird" >/dev/null; then
    if thunderbird_installieren; then
      ok "Thunderbird" "$(defaults read "$TB_APP/Contents/Info.plist" CFBundleShortVersionString) installiert"
      return
    fi
    grund+=", Installation fehlgeschlagen"
  fi
  offen "Thunderbird" "$grund"
  tun "als Administrator tests/mac-mini-setup.sh ausführen (installiert Thunderbird von Mozilla nach /Applications)"
  tun "oder von https://www.thunderbird.net laden und nach /Applications ziehen"
}

pruefe_werkzeuge() {
  local py v fehlt=() t
  if ! xcode-select -p >/dev/null 2>&1; then
    # /usr/bin/python3 und /usr/bin/git sind dann nur Platzhalter, die zur Installation auffordern
    py=$(command -v python3)
    if [[ -z $py || $py == /usr/bin/python3 ]]; then
      offen "Python 3" "fehlt (kommt mit den Befehlszeilenwerkzeugen von Apple, ebenso git)"
      tun "als Administrator: xcode-select --install   (im Fenster auf „Installieren“ klicken)"
      return 1
    fi
  fi
  v=$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null)
  if is-at-least 3.9 ${v:-0}; then
    ok "Python 3" "$v ($(command -v python3))"
  else
    offen "Python 3" "Version ${v:-?} – nötig ist 3.9 oder neuer"
    tun "als Administrator: xcode-select --install"
    return 1
  fi
  for t in git zip curl; do command -v $t >/dev/null || fehlt+=($t); done
  if (( $#fehlt )); then
    offen "Werkzeuge" "es fehlt: ${(j:, :)fehlt}"
    tun "als Administrator: xcode-select --install"
  else
    ok "Werkzeuge" "git, zip, curl"
  fi
  [[ $(command -v python3) == /opt/homebrew/* ]] &&
    hinweis "Python 3" "kommt aus Homebrew – Tests von Hand laufen dann mit einem anderen Python als der Runner"
}

# gh für die Aufgabenliste (optional, für die Tests nicht nötig). Auch ohne
# Homebrew im PATH suchen: Skript und Runner lesen ~/.zprofile nicht.
pruefe_gh() {
  local gh=${commands[gh]:-/opt/homebrew/bin/gh} st
  if [[ ! -x $gh ]]; then
    hinweis "gh" "nicht installiert (nur für die Aufgabenliste nötig)"
    tun "brew install gh && gh auth login --scopes project   (tests/MAC-MINI.md, Abschnitt 3)"
    return
  fi
  st=$($gh auth status 2>&1)
  if [[ $st != *"Logged in"* ]]; then
    hinweis "gh" "nicht angemeldet"
    tun "gh auth login --scopes project"
  elif [[ $st != *"'project'"* ]]; then
    hinweis "gh" "angemeldet, aber ohne Scope project (Aufgabenliste nicht lesbar)"
    tun "gh auth refresh --scopes project"
  else
    ok "gh" "angemeldet mit Scope project"
  fi
}

pruefe_bildschirm() {
  local zeile b h
  # JSON statt Text: die Schlüssel sind nicht übersetzt; _spdisplays_resolution = „UI Looks like“
  zeile=$(system_profiler -json SPDisplaysDataType 2>/dev/null | awk -F'"' '
    $2 == "_name"                   { pix = ""; res = "" }
    $2 == "_spdisplays_pixels"      { pix = $4 }
    $2 == "_spdisplays_resolution"  { res = $4 }
    $2 == "spdisplays_main" && $4 == "spdisplays_yes" { haupt = (res != "" ? res : pix) }
    END { print (haupt != "" ? haupt : (res != "" ? res : pix)) }')
  if [[ $zeile =~ '([0-9]+) x ([0-9]+)' ]]; then
    b=$match[1] h=$match[2]
    if (( b >= MIN_B && h >= MIN_H )); then
      ok "Bildschirm" "${b}×${h} (Testfenster 1500×900)"
      return
    fi
    offen "Bildschirm" "${b}×${h} – zu klein für die Testfenster (mindestens ${MIN_B}×${MIN_H})"
  else
    offen "Bildschirm" "keiner erkannt (system_profiler SPDisplaysDataType)"
  fi
  tun "virtuellen Bildschirm mit BetterDisplay anlegen (mindestens ${MIN_B}×${MIN_H}, als Hauptbildschirm)"
  tun "nur wenn das nicht geht: HDMI-Dummy-Stecker"
}

pruefe_rechte() {
  local app erlaubt tmp ergebnis neu tour=$ROOT/tests/ui_tour.py
  local pane='open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"'
  app=$(verantwortlich)
  neu="$app neu starten"
  [[ -n $SSH_CONNECTION ]] && neu="die SSH-Verbindung neu aufbauen"
  erlaubt=$(osascript -l JavaScript -e "$PROBE_JS" erlaubt 2>/dev/null)
  if [[ -z $erlaubt ]]; then
    offen "Bildschirmaufnahme" "keine Verbindung zur Bildschirmsitzung von $ME"
    tun "automatische Anmeldung einrichten (siehe unten) oder per Bildschirmfreigabe anmelden, dann erneut prüfen"
  elif [[ $erlaubt == nein ]]; then
    offen "Bildschirmaufnahme" "nicht erlaubt für $app – ui_tour.py nimmt Popups mit screencapture -l auf"
    (( CHECK )) || osascript -l JavaScript -e "$PROBE_JS" anfragen >/dev/null 2>&1
    if [[ -n $SSH_CONNECTION ]]; then
      tun "am Bildschirm des Mac (z. B. per RustDesk): Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme → „+“ → ⇧⌘G → /usr/libexec/sshd-keygen-wrapper → einschalten"
    else
      tun "Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme → $app einschalten"
    fi
    tun "danach $neu; Bereich direkt öffnen: $pane"
  else
    tmp=$(mktemp -d)
    ergebnis=$(osascript -l JavaScript -e "$PROBE_JS" aufnahme "$tmp/probe.png" 2>&1)
    rm -rf "$tmp"
    if [[ $ergebnis == ok ]]; then
      ok "Bildschirmaufnahme" "erlaubt für $app, Probeaufnahme des eigenen Testfensters stimmt"
    else
      offen "Bildschirmaufnahme" "erlaubt für $app, aber Probeaufnahme fehlgeschlagen: ${ergebnis:-ohne Meldung}"
      tun "Eintrag $app unter Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme aus- und wieder einschalten, danach $neu"
    fi
  fi

  if [[ ! -f $tour ]]; then
    hinweis "Automation" "tests/ui_tour.py fehlt in diesem Stand (Zweig design/durchlauf) – bisher nicht nötig"
  elif grep -qE 'System Events|tell application|Application\(' $tour; then
    hinweis "Automation" "ui_tour.py steuert andere Programme per Apple-Events – beim ersten Lauf die Rückfrage bestätigen"
    tun "Systemeinstellungen → Datenschutz & Sicherheit → Automation → $app"
  else
    ok "Automation" "nicht nötig (ui_tour.py liest per osascript nur die Fensterliste, keine Apple-Events)"
  fi
}

pruefe_anmeldung() {
  local auto konsole
  if [[ $(fdesetup status 2>/dev/null) == *"is On"* ]]; then
    offen "Automatische Anmeldung" "nicht möglich, solange FileVault eingeschaltet ist"
    tun "Testrechner ohne echte Daten: FileVault ausschalten – Systemeinstellungen → Datenschutz & Sicherheit → FileVault (oder: sudo fdesetup disable)"
    tun "danach als Administrator: sudo sysadminctl -autologin set -userName $ME -password -"
  else
    auto=$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)
    if [[ $auto == $ME && -e /etc/kcpassword ]]; then
      ok "Automatische Anmeldung" "für $ME eingeschaltet"
    else
      offen "Automatische Anmeldung" "${auto:+eingestellt für $auto, }nicht für $ME"
      tun "als Administrator: sudo sysadminctl -autologin set -userName $ME -password -   (fragt nach dem Passwort von $ME)"
      tun "oder Systemeinstellungen → Benutzer:innen & Gruppen → „Automatisch anmelden als“ → $ME"
    fi
  fi
  # Thunderbird-Fenster erscheinen nur, wenn die Sitzung von $ME gerade den Bildschirm hat
  konsole=$(stat -f %Su /dev/console 2>/dev/null)
  if [[ $konsole == $ME ]]; then
    ok "Sitzung" "$ME ist angemeldet und hat den Bildschirm"
  elif [[ $konsole == root || -z $konsole ]]; then
    offen "Sitzung" "niemand ist am Bildschirm angemeldet – Thunderbird kann kein Fenster öffnen"
    tun "automatische Anmeldung einrichten oder per Bildschirmfreigabe als $ME anmelden"
  else
    offen "Sitzung" "der Bildschirm gehört gerade $konsole – Tests brauchen die Sitzung von $ME im Vordergrund"
    tun "$konsole abmelden (nicht nur Benutzer wechseln)"
  fi
}

pruefe_tailscale() {
  local ts st ip
  ts=$(command -v tailscale)
  [[ -z $ts && -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]] && ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
  if [[ -z $ts ]]; then
    offen "Tailscale" "nicht installiert"
    tun "als Administrator von https://tailscale.com/download/mac installieren, anmelden und den Start beim Anmelden einschalten"
    return
  fi
  st=$("$ts" status --json 2>/dev/null | sed -n 's/^ *"BackendState": *"\([^"]*\)".*/\1/p' | head -1)
  if [[ $st == Running ]]; then
    ip=$("$ts" ip -4 2>/dev/null | head -1)
    ok "Tailscale" "verbunden${ip:+, Adresse $ip}"
  else
    offen "Tailscale" "installiert, aber nicht verbunden (${st:-Dienst antwortet nicht})"
    tun "Tailscale öffnen, anmelden und in den Einstellungen den Start beim Anmelden einschalten"
  fi
}

# erster Wert einer sshd-Einstellung (sshd nimmt den ersten; die Dateien in
# sshd_config.d werden ganz oben in sshd_config eingebunden)
sshd_wert() {
  cat /etc/ssh/sshd_config.d/*(N) /etc/ssh/sshd_config 2>/dev/null |
    awk -v k="$1" 'tolower($1) == tolower(k) { print tolower($2); exit }'
}

pruefe_ssh() {
  if nc -z -G 2 127.0.0.1 22 >/dev/null 2>&1; then
    # ohne KbdInteractiveAuthentication no fragt macOS (PAM) weiter nach dem Passwort
    if [[ $(sshd_wert PasswordAuthentication) == no && $(sshd_wert KbdInteractiveAuthentication) == no ]]; then
      ok "SSH" "Entfernte Anmeldung an, nur mit Schlüssel"
    else
      hinweis "SSH" "Entfernte Anmeldung an, Anmeldung mit Passwort ist erlaubt"
      tun "nur Schlüssel zulassen: tests/MAC-MINI.md, Abschnitt 4"
    fi
  else
    offen "SSH" "Entfernte Anmeldung ist aus (nötig für Claude Code aus der Desktop-App)"
    tun "Systemeinstellungen → Allgemein → Teilen → Entfernte Anmeldung: ein, Zugriff nur für $ME"
  fi
}

pruefe_runner() {
  local quelle=$ROOT/tests/mac-runner-hook.sh zeile plist
  if [[ ! -f $RUNNER/.runner ]]; then
    hinweis "GitHub-Runner" "nicht eingerichtet (optional, tests/MAC-MINI.md, Abschnitt 8)"
    return
  fi
  plist=(~/Library/LaunchAgents/actions.runner.*.plist(N))
  if (( $#plist )); then
    ok "GitHub-Runner" "als LaunchAgent von $ME eingerichtet"
  else
    offen "GitHub-Runner" "nicht als LaunchAgent eingerichtet (braucht die Bildschirmsitzung von $ME)"
    tun "cd $RUNNER && ./svc.sh install && ./svc.sh start"
  fi
  # Wächter: weist auf dem Mac alles außer Push auf main und manuellem Start ab
  zeile="ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOOK_ZIEL"
  if cmp -s $quelle $HOOK_ZIEL && grep -qxF $zeile $RUNNER/.env 2>/dev/null; then
    ok "Runner-Wächter" "nur Push auf main und manueller Start ($HOOK_ZIEL)"
  elif (( CHECK )); then
    offen "Runner-Wächter" "fehlt oder ist veraltet – Jobs aus Pull-Requests würden auf dem Mac nicht abgewiesen"
    tun "tests/mac-mini-setup.sh ohne --check ausführen, danach: cd $RUNNER && ./svc.sh stop && ./svc.sh start"
  else
    if mkdir -p ${HOOK_ZIEL:h} && cp $quelle $HOOK_ZIEL && chmod 755 $HOOK_ZIEL &&
       { grep -v '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' $RUNNER/.env 2>/dev/null; print -r -- $zeile } > $RUNNER/.env.neu &&
       mv $RUNNER/.env.neu $RUNNER/.env; then
      ok "Runner-Wächter" "eingerichtet ($HOOK_ZIEL)"
      tun "Runner neu starten, damit er den Wächter liest: cd $RUNNER && ./svc.sh stop && ./svc.sh start"
    else
      offen "Runner-Wächter" "ließ sich nicht einrichten"
    fi
  fi
}

# Remote Control (tests/MAC-MINI.md Abschnitt 12): LaunchAgent hält
# „claude remote-control“ im Checkout offen, damit Cloud-Sitzungen und die
# Claude-App den Rechner steuern können, ohne ihn von außen erreichbar zu machen
RC_LABEL=at.halo-spaces.remote-control
RC_ZIEL=$HOME/.config/halo-spaces/remote-control.sh   # außerhalb des Checkouts, wie der Runner-Wächter
RC_PLIST=$HOME/Library/LaunchAgents/$RC_LABEL.plist
RC_LOG=$HOME/Library/Logs/halo-remote-control.log
rc_plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$RC_LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$RC_ZIEL</string><string>$ROOT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$RC_LOG</string>
  <key>StandardErrorPath</key><string>$RC_LOG</string>
</dict>
</plist>
EOF
}
pruefe_remote_control() {
  local quelle=$ROOT/tests/mac-remote-control.sh claude c dom=gui/$(id -u)
  claude=${commands[claude]}
  for c in ~/.local/bin/claude /opt/homebrew/bin/claude /usr/local/bin/claude; do
    [[ -z $claude && -x $c ]] && claude=$c
  done
  if [[ -z $claude ]]; then
    hinweis "Remote Control" "claude nicht installiert (nur für die Steuerung aus Cloud-Sitzungen nötig)"
    tun "curl -fsSL https://claude.ai/install.sh | bash, dann im Repo claude starten und anmelden (Abschnitt 12)"
    return
  fi
  # ohne Terminal kann remote-control nicht fragen, ob dem Ordner vertraut wird
  if ! python3 - "$ROOT" <<'EOF' >/dev/null 2>&1
import json, os, sys
d = json.load(open(os.path.expanduser("~/.claude.json")))
sys.exit(0 if d.get("projects", {}).get(sys.argv[1], {}).get("hasTrustDialogAccepted") else 1)
EOF
  then
    hinweis "Remote Control" "$ROOT ist in Claude Code vermutlich noch nicht freigegeben"
    tun "cd $ROOT && claude   (anmelden, „Trust this folder“ bestätigen, /exit)"
  fi
  if cmp -s $quelle $RC_ZIEL && [[ $(rc_plist) == "$(cat $RC_PLIST 2>/dev/null)" ]]; then
    :
  elif (( CHECK )); then
    offen "Remote Control" "LaunchAgent fehlt oder ist veraltet – Cloud-Sitzungen erreichen den Rechner nicht"
    tun "tests/mac-mini-setup.sh ohne --check ausführen"
    return
  elif mkdir -p ${RC_ZIEL:h} ${RC_PLIST:h} ${RC_LOG:h} && cp $quelle $RC_ZIEL && chmod 755 $RC_ZIEL &&
       rc_plist > $RC_PLIST; then
    launchctl bootout $dom/$RC_LABEL 2>/dev/null
    if ! launchctl bootstrap $dom $RC_PLIST 2>/dev/null; then
      offen "Remote Control" "LaunchAgent eingerichtet, ließ sich aber nicht starten"
      tun "in der Bildschirmsitzung von $ME: launchctl bootstrap $dom $RC_PLIST"
      return
    fi
    sleep 5
  else
    offen "Remote Control" "LaunchAgent ließ sich nicht einrichten"
    return
  fi
  if launchctl print $dom/$RC_LABEL 2>/dev/null | grep -q 'state = running'; then
    ok "Remote Control" "läuft als LaunchAgent in $ROOT ($RC_LOG)"
  else
    offen "Remote Control" "LaunchAgent eingerichtet, claude läuft aber nicht"
    [[ -s $RC_LOG ]] && tail -3 $RC_LOG | sed 's/^/           /'
    tun "Protokoll: $RC_LOG; neu starten: launchctl kickstart -k $dom/$RC_LABEL"
  fi
}

# Windows-VM (Parallels Pro, tests/MAC-MINI.md Abschnitt 11): Einstellungen am Mac, Windows-Seite über
# tests/win-vm-setup.ps1 per prlctl exec. Mit --check wird eine pausierte VM nicht geweckt.
VM=${HALO_VM:-Windows 11}
VM_SHARE=$HOME/halo-vm
pruefe_vm() {
  local info state ed cpu mem tools shf vin
  if ! command -v prlctl >/dev/null; then
    hinweis "Windows-VM" "kein Parallels Desktop (optional, tests/MAC-MINI.md, Abschnitt 11)"
    return
  fi
  ed=$(prlsrvctl info --license 2>/dev/null | sed -n 's/.*edition="\([^"]*\)".*/\1/p')
  if [[ $ed == (pro|business) ]]; then
    ok "Parallels" "$(prlctl --version | awk '{print $3}'), Ausgabe $ed"
  else
    offen "Parallels" "Ausgabe ${ed:-unbekannt} – prlctl und prlsrvctl brauchen Pro oder Business"
    return
  fi
  if ! info=$(prlctl list -i "$VM" 2>/dev/null); then
    hinweis "Windows-VM" "„$VM“ nicht gefunden (andere VM mit HALO_VM=… wählen; prlctl list -a)"
    return
  fi
  state=$(prlctl status "$VM" | awk '{print $NF}')
  # feste Größe, damit die macOS-Tests daneben genug Speicher haben (16 GB im Mac mini)
  cpu=$(sed -n 's/^ *cpu cpus=\([0-9a-z]*\) auto=\([a-z]*\).*/\1 \2/p' <<<$info)
  mem=$(sed -n 's/^ *memory size=\([0-9]*\)Mb auto=\([a-z]*\).*/\1 \2/p' <<<$info)
  if [[ $cpu == "4 off" && $mem == "6144 off" ]]; then
    ok "VM-Größe" "4 Kerne, 6 GB"
  else
    hinweis "VM-Größe" "Kerne ${cpu:-?}, Speicher ${mem:-?} MB (vorgesehen: 4 Kerne, 6144 MB, fest)"
    tun "bei gestoppter VM: prlctl set \"$VM\" --cpus 4 && prlctl set \"$VM\" --memsize 6144"
  fi
  if [[ $info == *"Autostart: on"* && $info == *"Autostop: shutdown"* ]]; then
    ok "VM-Start" "mit dem Mac (start-host), fährt beim Ausschalten herunter"
  elif (( CHECK )); then
    offen "VM-Start" "startet nicht mit dem Mac oder wird beim Ausschalten nicht heruntergefahren"
  else
    prlctl set "$VM" --autostart start-host >/dev/null && prlctl set "$VM" --autostop shutdown >/dev/null &&
      ok "VM-Start" "eingerichtet (start-host, Herunterfahren mit dem Mac)" || offen "VM-Start" "ließ sich nicht setzen"
  fi
  # nur der Austauschordner, nichts vom Benutzerordner
  shf=$(sed -n '/^Host Shared Folders/,/^Host defined sharing/p' <<<$info | sed -n "s/^  \([^ ]*\) (+) path='\([^']*\)'.*/\1=\2/p")
  if [[ $shf == "halo=$VM_SHARE" && $info == *"Shared Profile: (-)"* && $info != *"Host defined sharing: "[HhAa]* &&
        $info == *"Host-to-guest apps sharing: off"* ]]; then
    ok "VM-Freigaben" "nur $VM_SHARE"
  elif (( CHECK )); then
    offen "VM-Freigaben" "${shf//$'\n'/, } – erwartet nur halo=$VM_SHARE, ohne geteiltes Profil und Programme"
  else
    mkdir -p $VM_SHARE && chmod 700 $VM_SHARE
    prlctl set "$VM" --shared-profile off >/dev/null; prlctl set "$VM" --shf-host-defined off >/dev/null
    prlctl set "$VM" --sh-app-host-to-guest off --sh-app-guest-to-host off >/dev/null
    prlctl set "$VM" --shf-guest off >/dev/null; prlctl set "$VM" --smart-mount off >/dev/null
    for vin in ${(f)"$(sed -n '/^Host Shared Folders/,/^Host defined sharing/p' <<<$info | sed -n 's/^  \([^ ]*\) (+) .*/\1/p')"}; do
      [[ -n $vin && $vin != halo ]] && prlctl set "$VM" --shf-host-del "$vin" >/dev/null
    done
    [[ $shf == *halo=* ]] || prlctl set "$VM" --shf-host on --shf-host-add halo --path $VM_SHARE --mode rw >/dev/null
    ok "VM-Freigaben" "auf $VM_SHARE beschränkt"
  fi
  tools=$(sed -n 's/^GuestTools: state=\([a-z]*\) version=\(.*\)/\1 \2/p' <<<$info)
  [[ $tools == installed* ]] && ok "Parallels Tools" "${tools#installed }" ||
    { offen "Parallels Tools" "${tools:-nicht installiert}"; tun "in Parallels: Aktionen → Parallels Tools installieren (am Bildschirm)"; }
  if prlctl snapshot-list "$VM" -j 2>/dev/null | grep -q '"name": *"sauber"' ||
     prlctl snapshot-list "$VM" -t 2>/dev/null | grep -q sauber; then
    ok "VM-Snapshot" "„sauber“ vorhanden"
  else
    hinweis "VM-Snapshot" "„sauber“ fehlt"
    tun "nach der Einrichtung: prlctl snapshot \"$VM\" --name sauber"
  fi
  if [[ $state != running ]]; then
    if (( CHECK )); then
      hinweis "Windows-VM" "$state – Windows und Thunderbird-Versionen werden beim nächsten Lauf mit --vm geprüft"
      return
    fi
    if [[ $state == (suspended|paused) ]]; then prlctl resume "$VM" >/dev/null; else prlctl start "$VM" >/dev/null; fi
    for _ in {1..60}; do [[ $(prlctl exec "$VM" --current-user cmd /c echo bereit 2>/dev/null) == bereit* ]] && break; sleep 3; done
  fi
  if [[ $(prlctl exec "$VM" --current-user cmd /c echo bereit 2>/dev/null) != bereit* ]]; then
    offen "Windows-VM" "$state, aber keine angemeldete Sitzung (prlctl exec --current-user)"
    tun "am Bildschirm: Windows-Benutzer automatisch anmelden lassen (tests/MAC-MINI.md, Abschnitt 11)"
    return
  fi
  ok "Windows-VM" "„$VM“ läuft, $(prlctl exec "$VM" --current-user cmd /c whoami 2>/dev/null | tr -d '\r') angemeldet"
  mkdir -p $VM_SHARE/setup && cp $ROOT/tests/win-vm-setup.ps1 $VM_SHARE/setup/
  # prüfen geht als angemeldeter Benutzer direkt von der Freigabe; einrichten als SYSTEM aus C:\ProgramData
  if (( CHECK )); then
    prlctl exec "$VM" --current-user powershell -NoProfile -ExecutionPolicy Bypass -File '\\Mac\halo\setup\win-vm-setup.ps1' -Check 2>&1 | tr -d '\r' | vm_zeilen
  else
    prlctl exec "$VM" --current-user cmd /c 'mkdir C:\ProgramData\halo-spaces 2>nul & copy /y \\Mac\halo\setup\win-vm-setup.ps1 C:\ProgramData\halo-spaces' >/dev/null
    prlctl exec "$VM" powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\ProgramData\halo-spaces\win-vm-setup.ps1' 2>&1 | tr -d '\r' | vm_zeilen
  fi
  prlctl exec "$VM" --current-user powershell -NoProfile -ExecutionPolicy Bypass -File '\\Mac\halo\setup\win-vm-setup.ps1' -Benutzer ${${CHECK:#0}:+-Check} 2>&1 | tr -d '\r' | vm_zeilen
  rm -rf $VM_SHARE/setup
}

# Ausgabe von win-vm-setup.ps1 übernehmen: „VM: “ vor den Namen, OFFEN mitzählen
vm_zeilen() {
  local z
  while IFS= read -r z; do
    case $z in
      OK*|OFFEN*|HINWEIS*) [[ $z == OFFEN* ]] && OFFEN=$(( OFFEN + 1 ))
        print -r -- "${z[1,9]}VM: ${z[10,-1]}" ;;
      ?*) print -r -- "         $z" ;;
    esac
  done
}

probelauf() {
  local args=() port=2839 log tblog rc
  if [[ ! -d $TB_APP ]] || ! python3 -c '' 2>/dev/null; then
    hinweis "Probelauf" "übersprungen – Thunderbird oder Python fehlt noch"
    return
  fi
  # --port gibt es erst ab dem Stand mit „Marionette-Port mit --port wählbar“
  if python3 "$ROOT/tests/halo_test.py" --help 2>/dev/null | grep -- '--port' >/dev/null; then
    args=(--port $PORT) port=$PORT
  else
    hinweis "Probelauf" "halo_test.py kennt --port noch nicht – läuft auf dem Standardport 2839"
  fi
  # zwei Läufe auf einem Port stören sich: der zweite verbindet sich mit dem Thunderbird
  # des ersten und bricht mit „Marionette-Verbindung geschlossen“ ab
  if nc -z -G 1 127.0.0.1 $port >/dev/null 2>&1 ||
     { (( ! $#args )) && pgrep -f -- '-profile .*/halo-test-' >/dev/null }; then
    offen "Probelauf" "es läuft schon ein Test auf Port $port – warten, bis er fertig ist${args:+, oder mit --port einen anderen wählen}"
    tun "laufende Test-Thunderbirds anzeigen: pgrep -fl halo-test-"
    return
  fi
  log=$(mktemp -t halo-probelauf)
  tblog=$log-thunderbird
  print "Probelauf: python3 tests/halo_test.py${args:+ ${args[*]}} (einige Minuten, Thunderbird öffnet ein Testfenster) …"
  python3 -u "$ROOT/tests/halo_test.py" $args --tb-log $tblog 2>&1 | tee $log | sed 's/^/    /'
  rc=${pipestatus[1]}
  if (( rc == 0 )); then
    ok "Probelauf" "$(tail -1 $log)"
  else
    offen "Probelauf" "$(tail -1 $log)"
    if [[ -s $tblog ]]; then
      print "         Thunderbird meldete zuletzt:"
      tail -5 $tblog | sed 's/^/           /'
    fi
    tun "Protokolle: $log und $tblog"
  fi
}

print "halo.spaces – Testrechner $( (( CHECK )) && print prüfen || print einrichten )"
print "  $ME · macOS $(sw_vers -productVersion) · $(sysctl -n hw.model) ($(uname -m))${SSH_CONNECTION:+ · per SSH}"
print
pruefe_verwaltung
pruefe_benutzer
pruefe_ruhezustand
pruefe_thunderbird
pruefe_werkzeuge
pruefe_gh
pruefe_bildschirm
pruefe_rechte
pruefe_anmeldung
pruefe_tailscale
pruefe_ssh
pruefe_runner
pruefe_remote_control
pruefe_vm
if (( PROBE )); then
  probelauf
else
  hinweis "Probelauf" "übersprungen (mit --probelauf ausführen)"
fi

print
if (( OFFEN )); then
  print "$OFFEN Punkt(e) offen – Befehle bzw. Orte stehen in den Zeilen mit →."
  exit 1
fi
print "Alles bereit."
