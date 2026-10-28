#!/bin/zsh
# Hält auf dem Mac mini eine Remote-Control-Sitzung von Claude Code offen
# (siehe tests/MAC-MINI.md, Abschnitt 12). Darüber steuern Cloud-Sitzungen und
# die Claude-App den Rechner, ohne dass er von außen erreichbar sein muss:
# claude baut die Verbindung selbst nach außen auf.
# Gestartet vom LaunchAgent at.halo-spaces.remote-control (eingerichtet von
# tests/mac-mini-setup.sh), der es nach einem Ende neu startet. Die Datei wird
# nach ~/.config/halo-spaces/ kopiert, nicht aus dem Checkout benutzt.
#   mac-remote-control.sh <Repo-Ordner>
# HALO_RC_NAME (Standard neon) benennt die Sitzungen, HALO_RC_MODUS setzt den
# Rechte-Modus (sonst gilt die Einstellung von Claude Code auf dem Rechner).
emulate -L zsh

REPO=${1:?Aufruf: mac-remote-control.sh <Repo-Ordner>}
NAME=${HALO_RC_NAME:-neon}
# LaunchAgents lesen ~/.zprofile nicht: übliche Orte von claude selbst ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
zeit() { date '+%F %T' }

cd $REPO 2>/dev/null || { print -u2 "$(zeit) Repo-Ordner $REPO fehlt"; exit 1 }
claude=${commands[claude]}
[[ -n $claude ]] || { print -u2 "$(zeit) claude nicht gefunden (Abschnitt 12)"; exit 1 }
print "$(zeit) Start: $claude remote-control in $REPO als $NAME"
exec $claude remote-control --name $NAME --remote-control-session-name-prefix $NAME \
  ${HALO_RC_MODUS:+--permission-mode} ${HALO_RC_MODUS}
