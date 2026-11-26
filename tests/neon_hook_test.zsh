# Prüfung des SessionStart-Hooks tests/neon-hook.sh ohne Claude, ohne Netz, im Wegwerf-Ordner:
# Rollenblöcke für github.comm.routine und designer, neon und neon-board unverändert gegenüber dem letzten Commit,
# jeder Rollenblock mit Stellenkarte und Antwortregel,
# fehlende oder kaputte Sitzungsdateien ändern nichts. Echte Sitzungsdateien (~/.claude/sessions)
# bleiben unberührt: der Test baut eine Kopie im Wegwerf-Ordner nach (HALO_SITZUNGEN_DIR).
# Aufruf: zsh tests/neon_hook_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
HOOK=$HIER/neon-hook.sh
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1"; FEHLER=1 }
pruefe() { # <Name> <Bedingung>
  local n=$1; shift
  if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi
}
# Vergleichsstand „unverändert“: derselbe Hook ohne Sitzungsdateien (HALO_SITZUNGEN_DIR zeigt ins Leere)
ref() { eingabe $2 $3 | HALO_SITZUNGEN_DIR=$T/gibtsnicht HALO_NEON=$1 sh $HOOK 2>&1 }
# Wegwerf-Stand für neon (offene Aufträge, Bilder-Indizes)
mkdir -p $T/stand/apple $T/stand/bilder $T/stand/eingang $T/sitz $T/leer
print -r -- "- #7 | 15.11. 10:00 | von Test | Probeauftrag | offen" > $T/stand/neon-stand.md
print -r -- "- #8 | 15.11. 10:00 | von Test | Board-Probe | offen" > $T/stand/board-stand.md
printf '%s\n' "| Datei | Inhalt |" "|---|---|" "| mail-a.png | unbeschrieben |" > $T/stand/apple/index.md
export HALO_NEON_STAND=$T/stand HALO_BOARD_DIR=$T/kein-board CLAUDE_PROJECT_DIR=$T
SID_GH=2777b112-0000-4000-8000-00000000aaaa SID_NEON=8d45f69e-0000-4000-8000-00000000bbbb
eingabe() { print -r -- "{\"session_id\":\"$1\",\"hook_event_name\":\"SessionStart\",\"source\":\"${2:-clear}\"}" }
lauf() { # <Hook> <Sitzungsordner> <sessionId> [source] → Ausgabe
  eingabe $3 $4 | HALO_SITZUNGEN_DIR=$2 sh $1 2>&1
}
sitzung() { # <Datei> <sessionId> <name>
  print -r -- "{\"pid\":${1:t:r},\"sessionId\":\"$2\",\"cwd\":\"$T\",\"kind\":\"interactive\",\"name\":\"$3\",\"status\":\"idle\"}" > $1
}

# 1. github.comm.routine über die sessionId (wie nach /clear), auch wenn die Kette nach neon aussieht
sitzung $T/sitz/40001.json $SID_GH github.comm.routine
sitzung $T/sitz/40002.json $SID_NEON neon
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_GH clear); rc=$?
pruefe "github per sessionId: Rollenblock mit PushNotification" '[[ $aus == *PushNotification* && $aus == *"github.comm.routine – Rolle"* ]]'
pruefe "github per sessionId: ohne neon-Auftragsliste und Bilder" '[[ $aus != *"Offene Aufträge"* && $aus != *Probeauftrag* && $aus != *Vorlagen:* && $aus != *"neon – Arbeitsweise"* ]]'
pruefe "github per sessionId: Stand-Datei, Ausnahmen, Rechte-Modus" '[[ $aus == *github-komm-stand.md* && $aus == *"CI rot"* && $aus == *"NOTFALL: Sicherung"* && $aus == *Rechte-Modus* ]]'
pruefe "github per sessionId: Inaktivitätsregel mit Markierung, Skript und Ausnahmen" '[[ $aus == *"we will close this issue due to inactivity"* && $aus == *inaktivitaet.sh* && $aus == *inaktivitaet-ausnahmen.txt* ]]'
pruefe "github: höchstens 15 Zeilen und unter 2600 Zeichen" '(( ${#${(f)aus}} <= 15 && ${#aus} < 2600 ))'
pruefe "github: Exitcode 0" '(( rc == 0 ))'
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_GH compact)
pruefe "github nach Verdichten: Hinweis und Rollenblock" '[[ $aus == *verdichtet* && $aus == *PushNotification* && $aus != *"Offene Aufträge"* ]]'

# 2. github.comm.routine über die Prozesskette (Datei <pid>.json eines Vorfahren, sessionId noch alt)
rm -f $T/sitz/*; sitzung $T/sitz/$$.json alte-id github.comm.routine
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON startup)
pruefe "github per Prozesskette: Rollenblock" '[[ $aus == *PushNotification* && $aus != *"Offene Aufträge"* ]]'

# 3. andere Sitzungen: Ausgabe wie ohne Sitzungsdateien (neon-Hinweise, keine Rolle)
rm -f $T/sitz/*; sitzung $T/sitz/40002.json $SID_NEON neon; sitzung $T/sitz/40001.json $SID_GH github.comm.routine
for q in startup clear compact; do
  alt=$(ref 1 $SID_NEON $q); neu=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON $q)
  pruefe "neon ($q): unverändert" '[[ -n $neu && $neu == $alt && $neu == *Probeauftrag* && $neu != *PushNotification* ]]'
done
alt=$(ref board $SID_NEON clear); neu=$(HALO_NEON=board lauf $HOOK $T/sitz $SID_NEON clear)
pruefe "neon-board: unverändert" '[[ -n $neu && $neu == $alt && $neu == *Board-Probe* ]]'

# 3a. designer (Gesprächskanal zum Designer): Rollenblock über sessionId (nach /clear), Prozesskette,
#     HALO_ROLLE und Arbeitsordner; ohne neon-Auftragsliste, auch wenn HALO_NEON gesetzt ist
SID_DES=5c3d0e11-0000-4000-8000-00000000cccc
mkdir -p $T/nacht $T/designer/unter
print x > $T/nacht/2026-11-15-designer-PVTI_probe.md
export HALO_NACHT_DIR=$T/nacht HALO_DESIGNER_DIR=$T/designer
rm -f $T/sitz/*; sitzung $T/sitz/40003.json $SID_DES designer; sitzung $T/sitz/40002.json $SID_NEON neon
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_DES clear); rc=$?
pruefe "designer per sessionId: Rollenblock" '[[ $aus == *"designer – Gesprächskanal"* && $aus == *design-vorgaben.md* && $aus == *"Abschnitt 10"* ]]'
pruefe "designer per sessionId: ohne neon-Hinweise und ohne github-Rolle" '[[ $aus != *"Offene Aufträge"* && $aus != *Probeauftrag* && $aus != *"neon – Arbeitsweise"* && $aus != *PushNotification* ]]'
pruefe "designer: Grenzen (kein Code, nur Name, Zitate nach Zustimmung) und neueste Berichte" '[[ $aus == *"kein commit/push"* && $aus == *"nie über Kennungen"* && $aus == *"nach Zustimmung"* && $aus == *designer-PVTI_probe.md* ]]'
pruefe "designer: höchstens 12 Zeilen und unter 2600 Zeichen, Exitcode 0" '(( ${#${(f)aus}} <= 12 && ${#aus} < 2600 && rc == 0 ))'
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_DES compact)
pruefe "designer nach Verdichten: Hinweis und Rollenblock" '[[ $aus == *verdichtet* && $aus == *"designer – Gesprächskanal"* ]]'
rm -f $T/sitz/*; sitzung $T/sitz/$$.json alte-id designer
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON startup)
pruefe "designer per Prozesskette: Rollenblock" '[[ $aus == *"designer – Gesprächskanal"* && $aus != *"Offene Aufträge"* ]]'
rm -f $T/sitz/*
aus=$(HALO_ROLLE=designer lauf $HOOK $T/sitz $SID_NEON startup)
pruefe "designer per HALO_ROLLE: Rollenblock" '[[ $aus == *"designer – Gesprächskanal"* ]]'
aus=$(CLAUDE_PROJECT_DIR=$T/designer/unter lauf $HOOK $T/sitz $SID_NEON startup)
pruefe "designer per Arbeitsordner: Rollenblock" '[[ $aus == *"designer – Gesprächskanal"* ]]'
# github und neon bleiben bei vorhandener designer-Sitzungsdatei unverändert
sitzung $T/sitz/40003.json $SID_DES designer; sitzung $T/sitz/40001.json $SID_GH github.comm.routine
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_GH clear)
pruefe "designer daneben: github weiter mit eigener Rolle" '[[ $aus == *PushNotification* && $aus != *"designer – Gesprächskanal"* ]]'
alt=$(ref 1 $SID_NEON clear); neu=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON clear)
pruefe "designer daneben: neon unverändert" '[[ -n $neu && $neu == $alt && $neu != *"designer – Gesprächskanal"* ]]'

# 3b. Stellenkarte und Antwortregel in jedem Rollenblock (Umbau-Woche P1, 26.11.2026)
rm -f $T/sitz/*; sitzung $T/sitz/40001.json $SID_GH github.comm.routine; sitzung $T/sitz/40003.json $SID_DES designer
antwort() { [[ $1 == *"jede Anfrage (Frage, Auftrag, Antrag)"* && $1 == *"auch eine Ablehnung (mit Grund)"* && $1 == *"reine Mitteilungen ohne Frage brauchen keine Antwort"* && $1 == *"Antrag, kein Befehl"* && $1 == *"Verweigertes nicht weiterreichen"* ]] }
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_GH clear)
pruefe "github: Karte comms und Antwortregel" '[[ $aus == *docs/stellen/comms.md* ]] && antwort $aus'
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_DES clear)
pruefe "designer: Karte designer und Antwortregel" '[[ $aus == *docs/stellen/designer.md* ]] && antwort $aus'
aus=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON clear)
pruefe "neon: Karte Sekretariat und Antwortregel" '[[ $aus == *docs/stellen/sekretariat.md* ]] && antwort $aus'
aus=$(HALO_NEON=board lauf $HOOK $T/sitz $SID_NEON clear)
pruefe "neon-board: Karte Sekretariat und Antwortregel" '[[ $aus == *docs/stellen/sekretariat.md* ]] && antwort $aus'

# 4. fehlende bzw. kaputte Sitzungsdateien: wie bisher, nie Abbruch
for fall in fehlt leer kaputt; do
  rm -rf $T/sitz; mkdir -p $T/sitz
  case $fall in
    fehlt)  rm -rf $T/sitz ;;
    kaputt) print -r -- '{"sessionId":"'$SID_GH'","name":' > $T/sitz/40001.json; head -c 64 /dev/urandom > $T/sitz/$$.json ;;
  esac
  alt=$(ref 1 $SID_GH clear); neu=$(HALO_NEON=1 lauf $HOOK $T/sitz $SID_GH clear); rc=$?
  pruefe "Sitzungsdateien $fall: unverändert, Exitcode 0" '[[ -n $neu && $neu == $alt && $neu != *PushNotification* ]] && (( rc == 0 ))'
done
# ohne Eingabe und ohne Sitzungsdateien: kein Abbruch
neu=$(HALO_NEON=1 HALO_SITZUNGEN_DIR=$T/fehlt sh $HOOK </dev/null 2>&1); rc=$?
pruefe "ohne Hook-Eingabe: neon-Hinweise, Exitcode 0" '[[ $neu == *Probeauftrag* ]] && (( rc == 0 ))'

# 5. Laufzeit (schnell, kein Netz): zehn Aufrufe unter 5 Sekunden
mkdir -p $T/sitz; sitzung $T/sitz/40001.json $SID_GH github.comm.routine
zmodload zsh/datetime; start=$EPOCHREALTIME
for i in {1..10}; do HALO_NEON=1 lauf $HOOK $T/sitz $SID_NEON clear >/dev/null; done
pruefe "zehn Aufrufe unter 5 Sekunden" '(( EPOCHREALTIME - start < 5 ))'

(( FEHLER )) && print "neon_hook_test: FEHLER" || print "neon_hook_test: alle Fälle grün"
exit $FEHLER
