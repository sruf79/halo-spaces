#!/bin/zsh
# Bilder-Eingang auf neon (tests/MAC-MINI.md Abschnitt 18; Auftrag des Maintainers vom 7.11.2026):
# `halobild <name>` legt Bilder vom Laptop in ~/halo-aufgaben/eingang/ ab. Alle 15 Minuten
# (LaunchAgent at.halo-spaces.bilder-eingang) sortiert dieses Skript sie ohne Claude ein – nur
# mv/cp, shasum und sips, belegt neon nicht:
#   apple-<rest>.png → ~/halo-aufgaben/apple/<rest>.png  (Zeile in apple/index.md)
#   <name>.png       → ~/halo-aufgaben/bilder/<name>.png (Zeile in bilder/index.md)
# Gültige Namen: klein, Ziffern und Bindestriche, ohne Leerzeichen, Endung .png
# ([a-z0-9]+(-[a-z0-9]+)*.png). Ungültige bleiben im Eingang (Protokoll, einmal Push aufs iPhone).
# Die Datei wird byteweise unverändert kopiert: SHA-256 im Eingang, nach dem Kopieren und im Ziel
# müssen gleich sein, erst dann wird der Eingang geleert. Gleicher Name ersetzt die ältere Fassung
# (alte Indexzeile weg, neue mit Datum und Hash, Beschreibung wieder „unbeschrieben“); gleicher
# Hash: nur den Eingang leeren. Pixelgröße per sips; sehr kleine Bilder (Fläche unter 4096 Pixel,
# also weniger als 64×64, oder eine Kante unter 32 Pixel) bekommen „Bild unzureichend“ in der
# Zeile und einen Push. Die Schwelle trifft nur offensichtlich Unbrauchbares: auch kleine
# Ausschnitte sind erlaubt (docs/board.md „Bildqualität“), ob Details erkennbar sind, beurteilt
# erst Claude. Passende Zeilen in bilder-offen.md (Name ohne Vorsatz apple-, erste Spalte genau
# gleich) werden ausgetragen; zu kleine Bilder nicht.
# Claude nur bei Arbeit (wie tests/vorpruefung.zsh): Stehen danach Zeilen mit „unbeschrieben“ in
# einem Index, beschreibt eine kurze Sitzung (Sonnet, --effort low) nur diese Zeilen und meldet zu
# schwache Bilder; höchstens 2 Versuche je Bild (Hash), dann einmal Push. Sonst eine Zeile
# „ÜBERSPRUNGEN bilder-eingang <Grund>“ (Protokoll und ~/halo-nacht/uebersprungen.log, eine
# gleiche Zeile nur einmal hintereinander), kein Push.
# Läuft nicht (ÜBERSPRUNGEN), wenn: Pause in ~/halo-nacht/pausen.txt (Routine bilder-eingang), ein
# anderer Lauf die Sperre hält, eine Sitzung ~/halo-aufgaben/bilder-eingang.sperre angelegt hat
# (gilt 2 Stunden ab Dateizeit), oder in den letzten 3 Minuten jemand anderes Indizes,
# bilder-offen.md, bilder/ oder apple/ geändert hat. Eingangsdateien, die jünger als 1 Minute sind
# (Übertragung läuft noch), warten auf den nächsten Lauf.
# Wie der CI-Wächter wird die Datei mit lauf-hilfen.zsh nach ~/.config/halo-spaces/ kopiert.
#   bilder-eingang.zsh [<Repo>]      Repo für die ui_tour-ids (Standard ~/halo-spaces)
# Zum Proben (tests/bilder_eingang_test.zsh): HALO_AUFGABEN (statt ~/halo-aufgaben),
# HALO_BILDER_LOG, HALO_UEBERSPRUNGEN_LOG, HALO_BILDER_CLAUDE=trocken (Claude nicht starten, nur
# protokollieren), HALO_BILDER_PUSH=aus (Push nur ins Protokoll), HALO_BILDER_WARTE=0 (Eingang
# ohne 1-Minuten-Wartezeit).
# Protokoll: ~/halo-aufgaben/bilder-eingang.log (launchd-Ausgabe ~/Library/Logs/halo-bilder-eingang.log).
emulate -L zsh
setopt extendedglob pipefail nullglob

path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8} LANG=${LANG:-en_US.UTF-8}

REPO=${1:-$HOME/halo-spaces}
A=${HALO_AUFGABEN:-$HOME/halo-aufgaben}
EIN=$A/eingang BILDER=$A/bilder APPLE=$A/apple OFFEN=$A/bilder-offen.md
LOG=${HALO_BILDER_LOG:-$A/bilder-eingang.log}
SPERRE=$A/.bilder-eingang.lauf        # Ordner mit pid: eigener Lauf
SITZUNGSSPERRE=$A/bilder-eingang.sperre
STEMPEL=$A/.bilder-eingang.stempel    # Zeit des letzten eigenen Schreibens
VERSUCHE=$A/bilder-eingang.versuche   # „<sha> <Anzahl>“: Beschreibungsversuche je Bild
GEMELDET=$A/bilder-eingang.gemeldet   # „<Art> <Name> <sha>“: schon per Push gemeldet
UELOG=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
WARTE=${HALO_BILDER_WARTE:-1}         # Minuten, die eine Eingangsdatei alt sein muss
KLEIN_FLAECHE=4096 KLEIN_KANTE=32
ROUTINE=bilder-eingang
mkdir -p $A $EIN $BILDER $APPLE ${LOG:h} ${UELOG:h}
source ${0:A:h}/lauf-hilfen.zsh       # zeit, log, push, pause_start

# ÜBERSPRUNGEN-Zeile; eine gleiche Zeile wie die letzte nur einmal (alle 15 Minuten sonst 96 je Tag)
ueberspringen() {   # <Grund>
  local text="ÜBERSPRUNGEN $ROUTINE $1" letzte
  letzte=$(grep -aF "ÜBERSPRUNGEN $ROUTINE " $UELOG 2>/dev/null | tail -1)
  [[ ${letzte#* * } == $text ]] && return 0
  log "$text"
  print -r -- "$(zeit) $text" >> $UELOG
}
melden() {   # <Text>: Push aufs iPhone (HALO_BILDER_PUSH=aus: nur Protokoll)
  if [[ $HALO_BILDER_PUSH == aus ]]; then log "PUSH (aus): $1"; else push "$1" $ROUTINE; fi
}
gemeldet() {   # <Art> <Name> <sha>: 0 = schon gemeldet, sonst merken und 1
  grep -qxF -- "$1 $2 $3" $GEMELDET 2>/dev/null && return 0
  print -r -- "$1 $2 $3" >> $GEMELDET
  return 1
}
sha() { shasum -a 256 -- $1 2>/dev/null | cut -d' ' -f1 }

# --- Vorbedingungen ---
pause_start $ROUTINE && exit 0
if ! mkdir $SPERRE 2>/dev/null; then
  if kill -0 $(<$SPERRE/pid) 2>/dev/null; then ueberspringen "anderer Lauf (pid $(<$SPERRE/pid)) arbeitet noch"; exit 0; fi
  log "alte Sperre ohne Lauf entfernt"; rm -rf $SPERRE; mkdir $SPERRE || exit 1
fi
print $$ > $SPERRE/pid
trap 'rm -rf $SPERRE' EXIT
if [[ -e $SITZUNGSSPERRE ]]; then
  jung=($SITZUNGSSPERRE(Nmm-120))
  if (( $#jung )); then ueberspringen "Sitzungssperre ${SITZUNGSSPERRE:t} (jünger als 2 Stunden)"; exit 0; fi
  log "Sitzungssperre ${SITZUNGSSPERRE:t} älter als 2 Stunden – nicht beachtet"
fi
# hat jemand anderes in den letzten 3 Minuten an Bildern oder Indizes gearbeitet?
neuer=(); [[ -e $STEMPEL ]] && neuer=(-newer $STEMPEL)
fremd=(${(f)"$(find $BILDER $APPLE $OFFEN -maxdepth 1 -mmin -3 $neuer 2>/dev/null)"})
fremd=(${fremd:#$BILDER}); fremd=(${fremd:#$APPLE})
if (( $#fremd )); then ueberspringen "Änderung in den letzten 3 Minuten (${fremd[1]:t}${fremd[2]:+, …}), eine Sitzung arbeitet vermutlich daran"; exit 0; fi

# --- Index-Helfer (python3): Zeile setzen, bilder-offen.md austragen, unbeschriebene Zeilen ---
INDEX_PY='
import sys, os, re
modus = sys.argv[1]
def lesen(p):
    try: return open(p, encoding="utf-8").read().splitlines()
    except OSError: return []
def schreiben(p, zeilen):
    t = p + ".neu"
    open(t, "w", encoding="utf-8").write("".join(z + "\n" for z in zeilen))
    os.replace(t, p)
def erste(z):
    t = z.strip()
    if not t.startswith("|"): return None
    return t.strip("|").split("|")[0].strip()
KOPF_BILDER = ["# Bilder zu Board-Einträgen", "",
  "Index von ~/halo-aufgaben/bilder/ (tests/bilder-eingang.zsh, docs/board.md). Nie ins Repo, nie in README oder Store (oft echte Mails).",
  "Bilder von vor dem 7.11.2026 stehen nicht im Index. „unbeschrieben“ füllt die Beschreibung (Claude, Sonnet) nach.", "",
  "| Name | Datum | SHA-256 | Pixel | Beschreibung |", "|---|---|---|---|---|"]
if modus == "setzen":
    datei, art, name, datum, h, pixel, klein = sys.argv[2:9]
    z = lesen(datei)
    if not z and art == "bilder": z = list(KOPF_BILDER)
    z = [l for l in z if erste(l) != name]
    note = ("Bild unzureichend: nur " + pixel + " px; ") if klein == "1" else ""
    if art == "apple":
        neu = "| %s | unbeschrieben | unbeschrieben | %sunbeschrieben (%s px) | unbeschrieben | %s | %s |" % (name, note, pixel, datum, h)
    else:
        neu = "| %s | %s | %s | %s | %sunbeschrieben |" % (name, datum, h, pixel, note)
    letzte = max([i for i, l in enumerate(z) if l.strip().startswith("|")], default=len(z) - 1)
    z.insert(letzte + 1, neu)
    schreiben(datei, z)
elif modus == "offen":
    datei, name, art, datum = sys.argv[2:6]
    z = lesen(datei)
    treffer = [l for l in z if erste(l) == name]
    teil = [erste(l) for l in z if erste(l) and erste(l) != name and (name.startswith(erste(l) + "-") or erste(l).startswith(name + "-"))]
    for t in teil: print("TEIL " + t)
    if not treffer: sys.exit(1)
    z = [l for l in z if erste(l) != name]
    z.append("Erledigt (ausgetragen): %s (%s) – automatisch einsortiert am %s (tests/bilder-eingang.zsh), Beschreibung folgt." % (name, art, datum))
    schreiben(datei, z)
elif modus == "unbeschrieben":
    for datei in sys.argv[2:]:
        for l in lesen(datei):
            if erste(l) and "unbeschrieben" in l:
                zellen = [c.strip() for c in l.strip().strip("|").split("|")]
                h = next((c for c in zellen if re.fullmatch(r"[0-9a-f]{64}", c)), "-")
                print(datei, zellen[0], h)
'
index() { python3 -I -c $INDEX_PY "$@" }

# --- Eingang einsortieren ---
probleme=() neu=0 ersetzt=0 gleich=0 liegen=0
for f in $EIN/*(N.); do
  n=${f:t}
  [[ $n == .* ]] && continue
  if [[ $n != [a-z0-9]##(-[a-z0-9]##)#.png ]]; then
    h=$(sha $f)
    gemeldet ungueltig $n $h && { (( liegen++ )); continue }   # schon gemeldet: nicht alle 15 Minuten erneut
    log "UNGÜLTIG $n – Name nicht klein/Bindestriche/Ziffern/.png, bleibt im Eingang"
    probleme+=("ungültiger Name „$n“ (bleibt im Eingang)")
    continue
  fi
  jung=(); (( WARTE > 0 )) && jung=($f(Nmm-$WARTE))
  if (( $#jung )); then log "WARTET $n – jünger als $WARTE Minute(n)"; continue; fi
  h=$(sha $f)
  [[ -n $h ]] || { log "FEHLER $n – nicht lesbar"; continue }
  w=$(sips -g pixelWidth $f 2>/dev/null | awk '/pixelWidth/{print $2}')
  ht=$(sips -g pixelHeight $f 2>/dev/null | awk '/pixelHeight/{print $2}')
  if [[ $w != <-> || $ht != <-> ]]; then
    gemeldet kaputt $n $h && { (( liegen++ )); continue }
    log "FEHLER $n – kein lesbares Bild (sips), bleibt im Eingang"
    probleme+=("„$n“ ist kein lesbares Bild (bleibt im Eingang)")
    continue
  fi
  if [[ $n == apple-?* ]]; then art=apple ziel=$APPLE/${n#apple-} idx=$APPLE/index.md
  else art=bilder ziel=$BILDER/$n idx=$BILDER/index.md; fi
  name=${ziel:t}
  if [[ -e $ziel && $(sha $ziel) == $h ]]; then
    rm -f -- $f; log "GLEICH $n – liegt unverändert in $art/, Eingang geleert"; (( gleich++ ))
    continue
  fi
  alt=; [[ -e $ziel ]] && alt=1
  cp -p -- $f $ziel.eingang-neu && [[ $(sha $ziel.eingang-neu) == $h ]] && mv -f -- $ziel.eingang-neu $ziel && [[ $(sha $ziel) == $h ]] || {
    rm -f -- $ziel.eingang-neu
    log "FEHLER $n – Kopie nach $art/ gescheitert oder Hash stimmt nicht, bleibt im Eingang"
    gemeldet kopie $n $h || probleme+=("„$n“ ließ sich nicht nach $art/ kopieren (Hash), bleibt im Eingang")
    continue }
  [[ $(sha $f) == $h ]] && rm -f -- $f
  klein=0
  (( w * ht < KLEIN_FLAECHE || w < KLEIN_KANTE || ht < KLEIN_KANTE )) && klein=1
  index setzen $idx $art $name $(date +%F) $h "${w}×${ht}" $klein
  if [[ -n $alt ]]; then log "ERSETZT $n → $art/$name (${w}×${ht}, $h)"; (( ersetzt++ ))
  else log "NEU $n → $art/$name (${w}×${ht}, $h)"; (( neu++ )); fi
  if (( klein )); then
    log "UNZUREICHEND $art/$name – nur ${w}×${ht} Pixel"
    gemeldet klein $name $h || probleme+=("Bild unzureichend: $art/$name nur ${w}×${ht} px")
  else
    [[ $art == apple ]] && austext="Apple-Vorlage" || austext="Board-Bild"
    out=$(index offen $OFFEN ${name%.png} $austext $(date +%F)) && log "AUSGETRAGEN ${name%.png} aus bilder-offen.md"
    for t in ${(f)out}; do [[ $t == TEIL\ * ]] && log "TEILWEISE ${name%.png} passt zu offenem Bild ${t#TEIL } (nicht ausgetragen)"; done
  fi
done
(( neu + ersetzt + gleich )) && touch $STEMPEL

# --- Beschreiben (Claude nur bei Arbeit) ---
offen=(${(f)"$(index unbeschrieben $APPLE/index.md $BILDER/index.md)"})
auftrag=() aufgegeben=()
for z in $offen; do
  h=${z##* }
  v=$(awk -v h=$h '$1==h{print $2}' $VERSUCHE 2>/dev/null); v=${v:-0}
  if (( v >= 2 )); then
    aufgegeben+=($z)
    gemeldet beschreibung ${${z% *}##* } $h || probleme+=("Beschreibung für ${${z% *}##* } nach 2 Versuchen gescheitert")
  else auftrag+=($z); fi
done
if (( $#auftrag )); then
  liste=$(for z in $auftrag; do d=${${z%% *}:h}; n=${${z% *}##* }; print -r -- "- ${d:t}/$n (Datei $d/$n, Index ${z%% *})"; done)
  prompt="Aufgabe ohne Rückfrage (Bilder-Eingang auf neon, docs/board.md „Apple-Vorlagen“). Diese Bilder sind neu einsortiert und im Index noch „unbeschrieben“:
$liste
Für jedes Bild: Datei mit Read ansehen und in seiner Indexzeile NUR die Felder bzw. Teile mit dem Wort „unbeschrieben“ ersetzen (Edit), alle anderen Zeilen und Felder unverändert lassen.
- apple/index.md (Spalten Name | App | macOS | Inhalt | ui_tour-ids | Datum | SHA-256): App (Mail, Kalender, Kontakte, Erinnerungen …), macOS-Version falls erkennbar sonst „unbekannt“, Inhalt knapp wie die übrigen Zeilen (was zu sehen ist, hell/dunkel, Pixelgröße aus der Zeile behalten, „(echte Mails/Daten möglich)“ falls echte Daten zu sehen sind), ui_tour-ids: passende \"id\"-Werte aus $REPO/tests/ui_tour.py (Grep), sonst „(keine passende id)“.
- bilder/index.md (Spalten Name | Datum | SHA-256 | Pixel | Beschreibung): Beschreibung in einem Satz (Bereich, was zu sehen ist, hell/dunkel).
- Ein schon vermerktes „Bild unzureichend“ bleibt stehen. Sind die entscheidenden Details (Schrift, Linien, Farben, Abstände) nicht klar erkennbar, setze vor die Beschreibung „Bild unzureichend: <Grund>; “.
Keine anderen Dateien ändern, nichts verschieben, kein Board, keine Nachrichten.
Antworte am Ende nur mit je einer Zeile „SCHWACH: <Name> – <Grund>“ für zu schwache Bilder, sonst mit „ALLES OK“."
  if [[ $HALO_BILDER_CLAUDE == trocken ]]; then
    namen=(${${auftrag[@]% *}##* })
    log "CLAUDE (trocken) würde $#auftrag Bild(er) beschreiben: ${(j:, :)namen}"
  else
    sid=$(uuidgen | tr A-Z a-z)
    # Arbeitsordner außerhalb von ~/halo*: zählt so nie als Sitzung am Repo (aktive_sitzung in lauf-hilfen.zsh)
    # dontAsk: nur die erlaubten Werkzeuge, Edit nur an den beiden Indizes (//… = absoluter Pfad)
    mkdir -p $HOME/.cache/halo-bilder-eingang
    log "Start Beschreibung, Sitzung $sid ($#auftrag Bild(er))"
    out=$(cd $HOME/.cache/halo-bilder-eingang && print -r -- $prompt | claude -p --model sonnet --effort low \
      --session-id $sid --permission-mode dontAsk --add-dir $A --add-dir $REPO \
      --allowedTools Read Grep Glob "Edit(/$APPLE/index.md)" "Edit(/$BILDER/index.md)" 2>&1)
    log "Claude: ${out//$'\n'/ | }"
    for z in ${(f)out}; do [[ $z == SCHWACH:* ]] && probleme+=("Bild unzureichend (Claude): ${z#SCHWACH: }"); done
    # Versuche zählen für die, die noch unbeschrieben sind
    noch=(${(f)"$(index unbeschrieben $APPLE/index.md $BILDER/index.md)"})
    for z in $auftrag; do
      h=${z##* }
      (( ${noch[(Ie)$z]} )) || continue
      if grep -q "^$h " $VERSUCHE 2>/dev/null; then
        awk -v h=$h '$1==h{$2=$2+1}1' $VERSUCHE > $VERSUCHE.neu && mv $VERSUCHE.neu $VERSUCHE
      else print "$h 1" >> $VERSUCHE; fi
    done
    touch $STEMPEL
  fi
elif (( neu + ersetzt + gleich == 0 && $#probleme == 0 )); then
  grund="Eingang leer"; (( liegen )) && grund="im Eingang nur $liegen schon gemeldete Datei(en) mit Problem"
  ueberspringen "$grund, keine unbeschriebenen Zeilen${aufgegeben:+ (${#aufgegeben} nach 2 Versuchen aufgegeben)}"
fi

(( neu + ersetzt + gleich )) && log "Eingang: $neu neu, $ersetzt ersetzt, $gleich unverändert"
(( $#probleme )) && melden "Bilder-Eingang: ${(j:; :)probleme}"
exit 0
