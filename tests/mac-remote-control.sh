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
# Rechte-Modus (Standard auto wie die Cloud-Sitzungen: bei verschiedenen Modi
# bleiben Antworten an Cloud-Sitzungen ohne Abfrage hängen; was neon
# regelmäßig braucht, erlaubt ~/.claude/settings.json ausdrücklich).
# Neue Sitzungen arbeiten direkt im Checkout (--spawn=same-dir), nicht in
# eigenen Worktrees – unabhängig davon, was zuletzt von Hand gewählt wurde.
emulate -L zsh

REPO=${1:?Aufruf: mac-remote-control.sh <Repo-Ordner>}
NAME=${HALO_RC_NAME:-neon}
MODUS=${HALO_RC_MODUS-auto}
# LaunchAgents lesen ~/.zprofile nicht: übliche Orte von claude selbst ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
zeit() { date '+%F %T' }

cd $REPO 2>/dev/null || { print -u2 "$(zeit) Repo-Ordner $REPO fehlt"; exit 1 }
claude=${commands[claude]}
[[ -n $claude ]] || { print -u2 "$(zeit) claude nicht gefunden (Abschnitt 12)"; exit 1 }
# Protokoll (StandardOutPath des LaunchAgents) nicht endlos wachsen lassen:
# ab 10 MB nach .1 … .5 weiterreichen und leeren (kopieren statt umbenennen –
# launchd schreibt weiter in die offene Datei, angehängt am Ende). Beim Start
# und stündlich; die Schleife endet mit dem LaunchAgent
LOGDATEI=${HALO_RC_LOG:-$HOME/Library/Logs/halo-remote-control.log}
rotieren() {
  local i
  [[ -f $LOGDATEI ]] && (( $(stat -f %z $LOGDATEI) > 10 * 1024 * 1024 )) || return 0
  for i in {4..1}; do [[ -f $LOGDATEI.$i ]] && mv -f $LOGDATEI.$i $LOGDATEI.$((i + 1)); done
  cp $LOGDATEI $LOGDATEI.1 && : > $LOGDATEI
  print "$(zeit) Protokoll rotiert (vorher > 10 MB, alt in ${LOGDATEI:t}.1 … .5)"
}
rotieren
{ while sleep 3600; do rotieren; done } &!
# kennzeichnet die Sitzungen als neon: tests/neon-hook.sh lädt dann bei Start
# und nach jedem Verdichten Arbeitsweise und offene Aufträge (AGENTS.md
# „Arbeitsweise von neon“)
export HALO_NEON=1
print "$(zeit) Start: $claude remote-control in $REPO als $NAME"
exec $claude remote-control --spawn=same-dir --name $NAME --remote-control-session-name-prefix $NAME \
  ${MODUS:+--permission-mode} ${MODUS}
