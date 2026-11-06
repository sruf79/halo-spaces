#!/bin/zsh
# Hält auf dem Mac mini eine Remote-Control-Sitzung von Claude Code offen
# (siehe tests/MAC-MINI.md, Abschnitt 12). Darüber steuern Cloud-Sitzungen und
# die Claude-App den Rechner, ohne dass er von außen erreichbar sein muss:
# claude baut die Verbindung selbst nach außen auf.
# Gestartet vom LaunchAgent at.halo-spaces.remote-control (eingerichtet von
# tests/mac-mini-setup.sh), der es nach einem Ende neu startet. Die Datei wird
# nach ~/.config/halo-spaces/ kopiert, nicht aus dem Checkout benutzt.
#   mac-remote-control.sh <Repo-Ordner>
# Zweite Instanz neon-board (nur Board und Bilder, AGENTS.md „neon erreichen“):
# LaunchAgent at.halo-spaces.neon-board mit HALO_RC_NAME=neon-board und
# ~/halo-board statt des Repo-Ordners (tests/MAC-MINI.md Abschnitt 12). Das
# Skript legt den Ordner an und schreibt bei jedem Start CLAUDE.md (Rolle) und
# .claude/settings.json (SessionStart-Hook ~/.config/halo-spaces/neon-hook.sh,
# Rechte) neu. Eigenes Protokoll über HALO_RC_LOG.
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

# Rolle und Einstellungen von neon-board: Ordner ohne Checkout, deshalb hier
# erzeugt statt eingecheckt – Änderungen hier machen, nicht im Ordner
board_ordner() {
  local d=$1 cfg=$HOME/.config/halo-spaces
  mkdir -p $d/.claude || return 1
  cat > $d/CLAUDE.md <<TEXT || return 1
# neon-board – nur Board und Bilder

Diese Sitzung (Remote Control „neon-board“ auf dem Mac mini neon) bedient
ausschließlich die Aufgabenliste und speichert Bilder. Regeln: AGENTS.md im
Checkout ~/halo-spaces (nur lesen), Abschnitte „Aufgabenliste“, „neon
erreichen“ und „Cloud-Sessions“.

Erlaubt:
- Board nur über $cfg/board.sh (liste [Muster], zeige, neu, status, notiz,
  archiv): lesen, anlegen, ergänzen, Status, archivieren. Vor „neu“ mit
  „liste '^Bereich:'“ Doppelte prüfen und lieber ergänzen. Nie ganze Listen
  ausgeben, nie gh project item-list ungefiltert.
- Bilder aus privaten Artifact-Seiten (Artifact, action "read", nicht
  WebFetch) unverändert nach ~/halo-aufgaben/bilder/, Apple-Vorlagen nach
  ~/halo-aufgaben/apple/ (Zeile in index.md: Name, App, macOS-Version, was zu
  sehen ist, ui_tour-ids, Datum, SHA-256); SHA-256 und Qualität prüfen und
  melden; ~/halo-aufgaben/bilder-offen.md pflegen.
- Zitate und Entscheidungen des Maintainers wörtlich mit Herkunft eintragen.

Nie: Tests, Builds, Thunderbird, Screenshots aufnehmen, git commit/push,
Release, Änderungen im Checkout ~/halo-spaces, LaunchAgents. Solche Aufträge
gehören an die Sitzung neon – dem Absender das so antworten.

Arbeitsweise:
- Längere Aufträge: HALO_STAND_NAME=board $cfg/neon-stand.sh neu <von> "<Auftrag>",
  Stand mit notiz, nach der Antwort fertig (~/halo-aufgaben/board-stand.md).
- Mehrere Einträge oder Bilder an einen Unteragenten (Agent), Ergebnis
  höchstens 10 Zeilen.
- Antworten mit SendMessage an den Namen der Sitzung aus ListAgents, knapp:
  Ergebnis, id, Fehlerzeile.
TEXT
  cat > $d/.claude/settings.json <<TEXT || return 1
{
  "permissions": {
    "allow": [
      "ListAgents",
      "SendMessage",
      "Bash($cfg/board.sh *)",
      "Bash(HALO_STAND_NAME=board $cfg/neon-stand.sh *)",
      "Bash(shasum *)",
      "Edit(~/halo-aufgaben/**)"
    ],
    "deny": [
      "Bash(git push*)",
      "Bash(git commit*)",
      "Bash(*halo_test.py*)",
      "Bash(*ui_tour.py*)",
      "Bash(*build.sh*)",
      "Bash(*release.sh*)",
      "Bash(*publish.sh*)",
      "Bash(prlctl *)",
      "Bash(launchctl *)"
    ]
  },
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "sh \"$cfg/neon-hook.sh\"" } ] }
    ]
  }
}
TEXT
}

if [[ $NAME == neon-board ]]; then
  board_ordner $REPO || { print -u2 "$(zeit) Ordner $REPO für neon-board nicht anlegbar"; exit 1 }
fi
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
# neon-board: HALO_NEON=board (eigene Hinweise im Hook) und eigene
# Auftragsliste ~/halo-aufgaben/board-stand.md (tests/neon-stand.sh)
if [[ $NAME == neon-board ]]; then
  export HALO_NEON=board HALO_STAND_NAME=board
else
  export HALO_NEON=1
fi
print "$(zeit) Start: $claude remote-control in $REPO als $NAME"
exec $claude remote-control --spawn=same-dir --name $NAME --remote-control-session-name-prefix $NAME \
  ${MODUS:+--permission-mode} ${MODUS}
