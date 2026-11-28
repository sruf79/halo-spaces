#!/bin/zsh
# Schalter der Umbau-Woche (Freigabe des Maintainers 20.11.2026: „Freigabe Umbau-Woche von Dienstag, 24.11.2026 (nach
# Ende des Volldampfs) bis Montag, 30.11.2026“; Plan bestätigt 21.11.2026, Sammelfrage S0 22.11.2026; ENTSCHEIDUNGEN.md
# „Umbau-Woche“). Datei ~/halo-nacht/umbau-woche.txt, eine Zeile:
#   umbau <ab ISO-Zeit mit Zone> <Grund>
# Kein Ende in der Datei: die Woche endet nur mit der Entscheidung des Maintainers (Plan Frage 7, Sammelfrage S8 am 30.11.).
# Logik in tests/umbau-woche.py (nur lesend). Läuft immer aus dem Checkout (keine Kopie in ~/.config/halo-spaces nötig).
#   zsh tests/umbau-woche.sh an [<ab ISO>|jetzt] [<Grund>]  schreibt die Zeile; ab = nächster Wochenreset (Di 00:00 UTC)
#   zsh tests/umbau-woche.sh aus <Herkunft/Zitat>          nur nach Entscheidung des Maintainers; Zeile in den Verlauf
#   zsh tests/umbau-woche.sh status                        eine Zeile; rc 0 aktiv, 3 angemeldet, 1 aus, 4 unlesbar
#   zsh tests/umbau-woche.sh aktiv                         nur rc (0 = gilt jetzt)
#   zsh tests/umbau-woche.sh worker-sperre                 rc 0 = keine neuen Worker (S0 a: ab Mo 20:00 = 5 Std. vor
#                                                          dem Beginn, danach die ganze Woche); gibt den Grund aus
#   zsh tests/umbau-woche.sh erlaubt <Typ> <Titel> [<id>] [<Status>]   darf ein Lauf den Eintrag beginnen? (ohne Woche: ja;
#                                                          Schalter unlesbar: Filter der Woche)
#   zsh tests/umbau-woche.sh fable <Titel> [<id>]          rc 0 = Fable aus der Tagesroutine erlaubt (S0 b; ohne Woche: ja;
#                                                          Schalter unlesbar: gesperrt wie in der Woche)
#   zsh tests/umbau-woche.sh sortieren [<export.json>]     Listen A–D (+N, W, U) für Tag 1, schreibt nichts; ohne Datei
#                                                          liest es tests/board.sh export und grüne CI-Läufe über gh
#   zsh tests/umbau-woche.sh faellig                       rc 0 = Woche gilt und Tag 1 ist noch nicht sortiert
#   zsh tests/umbau-woche.sh sortiert <Bericht>            Marke „Tag 1 sortiert“ (schreibt der Nachtlauf nach dem Sortieren)
# Proben: HALO_UMBAU_DATEI, HALO_UMBAU_SORTIERT, HALO_UMBAU_VERLAUF (Ordner), HALO_JETZT, HALO_UMBAU_REPO.
emulate -L zsh
setopt pipe_fail
HIER=${0:A:h}
PY=$HIER/umbau-woche.py
DIR=${HALO_NACHT_DIR:-$HOME/halo-nacht}
DATEI=${HALO_UMBAU_DATEI:-$DIR/umbau-woche.txt}
MARKE=${HALO_UMBAU_SORTIERT:-${DATEI:h}/umbau-sortiert.txt}
VERLAUF=${HALO_UMBAU_VERLAUF:-${DATEI:h}}
VORLAUF_H=${UMBAU_WORKER_VORLAUF_H:-5}   # S0 a: „ab Mo 23.11. 20:00 keine neuen Worker bis Di 01:00“
REPO=${HALO_UMBAU_REPO:-${HIER:h}}
py() { python3 -I $PY "$@" }
zustand() { py zustand $DATEI }
naechster_reset() {   # nächster automatischer Wochenreset (Di 00:00 UTC) nach jetzt, wie tests/volldampf.sh
  python3 -I -c '
import os, datetime as d
j = os.environ.get("HALO_JETZT")
n = d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()
u = n.astimezone(d.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
u += d.timedelta(days=(1 - u.weekday()) % 7)
if u <= n: u += d.timedelta(days=7)
print(u.astimezone().isoformat(timespec="minutes"))'
}
jetzt_iso() { python3 -I -c 'import os,datetime as d;j=os.environ.get("HALO_JETZT");print((d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()).isoformat(timespec="minutes"))' }
stempel() { python3 -I -c 'import os,datetime as d;j=os.environ.get("HALO_JETZT");print((d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()).strftime("%Y%m%d-%H%M%S"))' }
status_zeile() {   # rc wie „status“
  local -a z; z=("${(@ps:\t:)$(zustand)}")
  case $z[1] in
    aktiv)      print -r -- "Umbau-Woche aktiv seit $z[2] (endet nur mit der Entscheidung des Maintainers) – $z[3]"; return 0 ;;
    angemeldet) print -r -- "Umbau-Woche angemeldet ab $z[2], noch nicht aktiv – $z[3]"; return 3 ;;
    unlesbar)   print -r -- "FEHLER: Schalter $DATEI unlesbar („$z[3]“) – gilt nicht"; return 4 ;;
    *)          print -r -- "Umbau-Woche aus"; return 1 ;;
  esac
}
cmd=${1:-status}; (( $# )) && shift
case $cmd in
  an)
    status_zeile >/dev/null; rc=$?
    (( rc == 0 || rc == 3 )) && { print "Schalter steht schon:"; status_zeile; exit 0 }
    ab=${1:-$(naechster_reset)}; (( $# )) && shift
    [[ $ab == jetzt ]] && ab=$(jetzt_iso)
    grund=${*:-Freigabe Umbau-Woche des Maintainers vom 20.11.2026 (ENTSCHEIDUNGEN.md), Schalter per tests/umbau-woche.sh}
    [[ -s $DATEI ]] && mv -f $DATEI $VERLAUF/umbau-woche-alt-$(stempel).txt
    mkdir -p ${DATEI:h}
    print -r -- "umbau $ab $grund" > $DATEI.neu && mv -f $DATEI.neu $DATEI
    status_zeile; rc=$?
    (( rc == 0 || rc == 3 )) || { print -u2 "FEHLER: Zeile gilt nicht (Zeit ISO mit Zone?)"; mv -f $DATEI $VERLAUF/umbau-woche-fehler-$(stempel).txt; exit 1 }
    print "Keine neuen Worker ab $(python3 -I -c 'import sys,datetime as d;print((d.datetime.fromisoformat(sys.argv[1])-d.timedelta(hours=float(sys.argv[2]))).isoformat(timespec="minutes"))' $ab $VORLAUF_H) (S0 a)." ;;
  aus)
    [[ -n $1 ]] || { print -u2 "Aufruf: tests/umbau-woche.sh aus <Herkunft/Zitat der Entscheidung des Maintainers>"; exit 2 }
    if [[ -s $DATEI ]]; then
      z=$VERLAUF/umbau-woche-aus-$(stempel).txt
      { cat $DATEI; print -r -- "# aus $(jetzt_iso): $*" } > $z && rm -f $DATEI
      print -r -- "Umbau-Woche aus (Verlauf: ${z:t})."
    else
      print "Kein Schalter, Umbau-Woche war schon aus."
    fi ;;
  status) status_zeile; exit $? ;;
  aktiv) status_zeile >/dev/null; exit $? ;;
  worker-sperre) py sperre $DATEI $VORLAUF_H; exit $? ;;
  erlaubt)
    (( $# >= 2 )) || { print -u2 "Aufruf: tests/umbau-woche.sh erlaubt <Typ> <Titel> [<id>] [<Status>]"; exit 2 }
    status_zeile >/dev/null; rc=$?
    (( rc == 0 )) && { py erlaubt "$@"; exit $? }
    # Unlesbarer Schalter (Fable-Prüfung M7): die Woche gilt nicht automatisch (kein Sortieren, keine Sperren), aber er
    # gibt auch nicht alles frei – sicherer Standard ist der Filter der Woche, wie Rückfall B im Nachtlauf-Auftrag
    if (( rc == 4 )); then
      # ohne Lockerung (Gegenprüfung 28.11.2026, C): bei unlesbarem Schalter gilt nur der starre Filter
      out=$(HALO_UMBAU_LOCKERUNG=/dev/null/keine-lockerung py erlaubt "$@"); r=$?
      print -r -- "$out (Schalter unlesbar: starrer Filter der Umbau-Woche ohne Lockerung, bis geklärt)"; exit $r
    fi
    [[ $4 == Pausiert ]] && { print "nein Status Pausiert (nie bearbeiten, nie schließen)"; exit 1 }
    print "ja Umbau-Woche nicht aktiv"; exit 0 ;;
  fable)
    (( $# >= 1 )) || { print -u2 "Aufruf: tests/umbau-woche.sh fable <Titel> [<id>]"; exit 2 }
    status_zeile >/dev/null; rc=$?
    (( rc == 0 || rc == 4 )) || exit 0   # unlesbar: Fable bleibt gesperrt wie in der Woche (M7)
    py fable "$@"; exit $? ;;
  sortieren)
    if [[ -n $1 ]]; then
      py sortieren $1 $REPO "${@[2,-1]}"; exit $?
    fi
    t=$(mktemp -d) || exit 1
    trap 'rm -rf $t' EXIT
    HALO_BOARD_ZWISCHEN_S=0 zsh $HIER/board.sh export > $t/export.json || { print -u2 "FEHLER: board.sh export"; exit 1 }
    git -C $REPO fetch -q origin 2>/dev/null
    # mit Zweig: A verlangt einen grünen Lauf auf main (bzw. Release-Tag), Prüfzweig-Läufe zählen nur für B (S0 c)
    if gh run list -R sruf79/halo-spaces -w test.yml -s success -e push -L 300 --json headSha,headBranch \
         -q '.[] | .headSha + "\t" + .headBranch' > $t/gruen.txt 2>/dev/null; then
      py sortieren $t/export.json $REPO --gruen $t/gruen.txt; exit $?
    fi
    print "# Hinweis: grüne CI-Läufe nicht lesbar (gh) – grün gilt nur, was in einem Release-Tag steckt"
    py sortieren $t/export.json $REPO; exit $? ;;
  faellig) status_zeile >/dev/null && [[ ! -s $MARKE ]] && exit 0; exit 1 ;;
  sortiert)
    [[ -n $1 ]] || { print -u2 "Aufruf: tests/umbau-woche.sh sortiert <Bericht>"; exit 2 }
    status_zeile >/dev/null || { print -u2 "Umbau-Woche nicht aktiv – keine Marke"; exit 1 }
    print -r -- "sortiert $(jetzt_iso) $*" >> $MARKE; print "Tag 1 sortiert: Marke ${MARKE:t}" ;;
  *) print -u2 "Aufruf: tests/umbau-woche.sh an|aus|status|aktiv|worker-sperre|erlaubt|fable|sortieren|faellig|sortiert"; exit 2 ;;
esac
