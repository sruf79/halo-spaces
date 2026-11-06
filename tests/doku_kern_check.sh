#!/bin/zsh
# Wächter für AGENTS.md (Stufenplan vom 6.11.2026): prüft per grep, dass die harten Sperren und
# Pflichtbegriffe im Kern stehen, und dass AGENTS.md keine @-Importe enthält (Importe würden
# ausgelagerte Teile doch wieder in jede Sitzung laden). Je fehlendem Begriff eine Zeile
# „FEHLER …“, Exitcode 1; sonst „OK …“, Exitcode 0. Läuft in der samstäglichen Doku-Prüfung
# (tests/wochenpruefung.sh --doku) und von Hand: tests/doku_kern_check.sh [AGENTS.md]
# Begriffe ändern nur mit Entscheidung des Maintainers (Sperren), neue Pflichtbegriffe dürfen dazu.
setopt nounset
datei=${1:-${0:A:h:h}/AGENTS.md}
[[ -f $datei ]] || { print -u2 "FEHLER Datei fehlt: $datei"; exit 2 }

# Muster (grep -F) | Bedeutung
begriffe=(
  'Push-Sperre 01:30–09:00|Push-Sperre 01:30–09:00'
  'ab 00:00 keinen|ab 00:00 kein Push mit Codeänderung'
  '**nur auf neon**, nie auf dem Laptop|Release (release.sh/publish.sh) nur auf neon'
  'release-<version>.ok|Release nur mit Testmarke'
  'Einzige Bedingung: grüne Tests|Release-Bedingung grüne Tests'
  'Die Sperre nicht umgehen|Release-Sperre nicht umgehen'
  'HOTFIX=|Hotfix nur auf ausdrückliche Anweisung'
  'Screenshots mit echten Mails|Datenschutz: keine echten Mails/Screenshots ins Repo'
  'nicht in README oder Store verwenden|Datenschutz: nicht in README oder Store'
  'Inhalte der Liste nie öffentlich|Board nie öffentlich'
  '`if:`-Bedingung nicht lockern|if:-Bedingung der Mac-Jobs'
  'Runner.Worker|keine eigenen Läufe bei laufendem Runner.Worker'
  'Den Nachtlauf nicht behindern|Nachtlauf nicht behindern'
  'Zitate erst nach Zustimmung|Zitate erst nach Zustimmung'
  'Entscheidungen des Maintainers wörtlich|Entscheidungen wörtlich'
  'Höchstens drei Einträge in Arbeit|höchstens drei in Arbeit'
  'Reihenfolge eines Laufs|Reihenfolge eines Laufs'
  'neon-board|Regel zu neon-board'
  '`[opus]`|Auftragskennzeichen [opus]/[sonnet]'
  'ENTSCHEIDUNGEN.md|Verweis ENTSCHEIDUNGEN.md'
  'docs/neon-sitzung.md|Verweis docs/neon-sitzung.md'
  'docs/github-komm.md|Verweis docs/github-komm.md'
  'docs/board.md|Verweis docs/board.md'
  'docs/testrechner.md|Verweis docs/testrechner.md'
  'nie auf die private Aufgabenliste verweisen|GitHub: nie aufs Board verweisen'
)
fehler=0
for e in $begriffe; do
  muster=${e%%|*} was=${e#*|}
  if ! grep -qF -- $muster $datei; then
    print "FEHLER fehlt in AGENTS.md: $was („$muster“)"
    fehler=1
  fi
done

# keine @-Importe: Zeilen, die mit @ beginnen, oder @pfad/… ausserhalb von Code (Backticks)
if grep -nE '^[[:space:]]*@[A-Za-z0-9./_~-]+' $datei >/dev/null; then
  print "FEHLER AGENTS.md enthält @-Import(e):"; grep -nE '^[[:space:]]*@[A-Za-z0-9./_~-]+' $datei | head -5
  fehler=1
fi
if sed 's/`[^`]*`//g' $datei | grep -nE '(^|[[:space:](])@(docs|tests|ENTSCHEIDUNGEN|README|AGENTS)[A-Za-z0-9./_-]*' >/dev/null; then
  print "FEHLER AGENTS.md bindet Dateien per @ ein"; fehler=1
fi

# ausgelagerte Dateien müssen existieren
for d in ENTSCHEIDUNGEN.md docs/neon-sitzung.md docs/github-komm.md docs/board.md docs/testrechner.md; do
  [[ -f ${datei:h}/$d ]] || { print "FEHLER fehlt: $d"; fehler=1 }
done

(( fehler )) && exit 1
print "OK  AGENTS.md: ${#begriffe} Pflichtbegriffe vorhanden, keine @-Importe, ausgelagerte Dateien da ($(wc -c < $datei | tr -d ' ') Byte)"
