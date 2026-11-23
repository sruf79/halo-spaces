#!/bin/bash
# Einrichtung der Linux-VM auf neon (Parallels, VM „Ubuntu“, Ubuntu ARM64, Benutzer parallels). Wiederholbar: ein
# erneuter Aufruf holt neue Thunderbird-Versionen und setzt die Einstellungen erneut. Zweck (Maintainer 21.11.2026,
# „ja ok“): nur Werkzeug für einen Linux-Rundgang und Design-Entscheidungen mit echter Oberfläche statt xvfb; GitHub-
# Linux bleibt die einzige Quelle für grün, die VM zählt nie für die Testmarke.
#
# Aufruf vom Mac (VM läuft, Skript liegt in der Freigabe ~/halo-vm, in der VM /media/psf/halo-vm):
#   prlctl exec Ubuntu bash /media/psf/halo-vm/<ordner>/linux-vm-setup.sh                 # als root: Programme
#   prlctl exec Ubuntu --current-user bash /media/psf/halo-vm/<ordner>/linux-vm-setup.sh --benutzer   # Sitzung
# Bequemer: tests/linux_vm.py --einrichten (startet die VM, ruft beides auf, fährt sie wieder herunter).
#
# Thunderbird: Mozilla baut für Linux nur x86_64; ARM64 gibt es als Snap (Herausgeber Canonical, geprüft). Release aus
# latest/stable als „thunderbird“, Beta aus latest/beta als zweite Instanz „thunderbird_beta“. Beide ohne
# Selbst-Update (snap refresh --hold), neue Versionen holt ein erneuter Aufruf. Der Snap sieht ein eigenes /tmp:
# tests/linux_vm.py legt Profile deshalb unter ~/halo-lauf an (TMPDIR).
set -u

if [[ ${1:-} == --benutzer ]]; then
  # Einstellungen der angemeldeten GNOME-Sitzung (prlctl exec --current-user bringt die Umgebung nicht mit)
  export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
  gsettings set org.gnome.desktop.session idle-delay 0                 # kein Bildschirmschoner
  gsettings set org.gnome.desktop.screensaver lock-enabled false       # keine Sperre
  gsettings set org.gnome.desktop.notifications show-banners false     # keine Meldungen über dem Testfenster
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type nothing
  mkdir -p ~/halo-lauf
  echo "OK Sitzung eingerichtet"
  exit 0
fi

[[ $(id -u) == 0 ]] || { echo "FEHLER als root aufrufen (prlctl exec ohne --current-user)"; exit 1; }
fehler=0
snap set system experimental.parallel-instances=true
snap set system refresh.retain=2

installieren() {  # <Instanz> <Kanal>
  if snap list "$1" >/dev/null 2>&1; then
    snap refresh "$1" --channel="$2" --unhold >/dev/null 2>&1 || true
    snap refresh "$1" --channel="$2" || fehler=1
  else
    snap install "$1" --channel="$2" || fehler=1
  fi
  snap refresh --hold "$1" >/dev/null || fehler=1
  echo "$1: $(snap list "$1" 2>/dev/null | awk 'NR==2 {print $2, $4}')"
}
installieren thunderbird latest/stable
installieren thunderbird_beta latest/beta

# Schrift für Emojis und openssl für die HTTPS-Testserver (bei Ubuntu Desktop meist schon da)
fehlt=()
for p in fonts-noto-color-emoji openssl python3; do dpkg -s "$p" >/dev/null 2>&1 || fehlt+=("$p"); done
if (( ${#fehlt[@]} )); then
  apt-get -o Acquire::Retries=3 update -q && apt-get install -yq "${fehlt[@]}" || fehler=1
fi
# keine automatischen Updates mit Neustart-Hinweis während eines Laufs
systemctl disable --now unattended-upgrades.service >/dev/null 2>&1 || true

(( fehler )) && { echo "FEHLER Einrichtung unvollständig"; exit 1; }
echo "OK Programme eingerichtet"
