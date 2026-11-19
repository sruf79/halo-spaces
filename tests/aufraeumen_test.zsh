#!/bin/zsh
# Logik-Test für tests/aufraeumen.sh in einem temporären Repo (kein Eingriff ins echte Repo, kein Netz,
# kein gh). Je Fall eine Zeile OK/FEHLER, Exitcode 0 nur bei Erfolg.
#   zsh tests/aufraeumen_test.zsh
emulate -L zsh
setopt extendedglob nullglob
SKRIPT=${0:A:h}/aufraeumen.sh
T=$(mktemp -d)
SCHLAEFER=
trap 'kill $SCHLAEFER 2>/dev/null; rm -rf $T' EXIT
fehler=0
pruefe() {   # <Name> <Bedingung>
  if eval $2; then print -r -- "OK $1"; else print -r -- "FEHLER $1"; fehler=1; fi
}
alt() { find $1 -exec touch -h -t 202601010000 {} + }   # alles im Ordner auf 1.1.2026 setzen

export GIT_AUTHOR_NAME=Test GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=Test GIT_COMMITTER_EMAIL=t@t
git init -q --bare -b main $T/origin.git
git clone -q $T/origin.git $T/repo 2>/dev/null
R=$T/repo
cd $R
git checkout -q -b main 2>/dev/null
print 'dist/\n*.xpi\nvorschau-*.png\n.claude/worktrees/\nrepo.conf' > .gitignore
print 'repo=probe' > repo.conf
print a > a.txt
git add -A && git commit -qm start && git push -q origin main 2>/dev/null
W=$R/.claude/worktrees
mkdir -p $W
# 1 sauber, in main → weg
git worktree add -q -b worktree-agent-a1 $W/agent-a1 main
# 2 ungespeicherte Änderung → bleibt
git worktree add -q -b worktree-agent-a2 $W/agent-a2 main; print x >> $W/agent-a2/a.txt
# 3 Commit nur dort → bleibt
git worktree add -q -b worktree-agent-a3 $W/agent-a3 main; (cd $W/agent-a3 && print b > b.txt && git add b.txt && git commit -qm nur-hier)
# 4 nur erzeugte ignorierte Dateien → weg
git worktree add -q -b worktree-agent-a4 $W/agent-a4 main; mkdir $W/agent-a4/dist && print x > $W/agent-a4/dist/halo.xpi
# 5 ignorierte Datei, die nicht sicher ersetzbar ist → bleibt
git worktree add -q -b worktree-agent-a5 $W/agent-a5 main; print x > $W/agent-a5/vorschau-1.png
# 6 von lebendem Prozess gesperrt → bleibt
git worktree add -q -b worktree-agent-a6 $W/agent-a6 main; git worktree lock --reason "claude agent agent-a6 (pid $$ start x)" $W/agent-a6
# 7 Commit per Rebase/cherry-pick schon in main → Kopie weg, Zweig bleibt (git branch -d lehnt ab)
git worktree add -q -b worktree-agent-a7 $W/agent-a7 main; (cd $W/agent-a7 && print c > c.txt && git add c.txt && git commit -qm gepickt)
print d > d.txt && git add d.txt && git commit -qm vorher && git cherry-pick worktree-agent-a7 >/dev/null && git push -q origin main 2>/dev/null
(cd $W/agent-a7 && git reset -q --hard HEAD)    # Kopie bleibt auf dem eigenen Commit
# 8 sauber, aber frisch → bleibt
git worktree add -q -b worktree-agent-a8 $W/agent-a8 main
# 9 sauber, alt, aber Protokoll des Hilfsagenten frisch → bleibt
git worktree add -q -b worktree-agent-a9 $W/agent-a9 main
mkdir -p $T/proj/p/s1/subagents && print '{}' > $T/proj/p/s1/subagents/agent-a9.jsonl
# 10 sauber, alt, aber ein Prozess arbeitet darin → bleibt
git worktree add -q -b worktree-agent-a10 $W/agent-a10 main
(cd $W/agent-a10 && exec sleep 120) &
SCHLAEFER=$!
for n in 1 2 3 4 5 6 7 9 10; do alt $W/agent-a$n; done
# Worker des Auslastungswächters (~/halo-worker, Maintainer 19.11.2026)
WK=$T/worker; mkdir -p $WK
# w1 leer auf eigenem Zweig, repo.conf wie im Repo → weg, Zweig weg
git worktree add -q -b pruef/worker-w1 $WK/worker-w1 main; cp repo.conf $WK/worker-w1/
# w2 Commit per cherry-pick schon in main → weg, Zweig weg (-D)
git worktree add -q -b pruef/worker-w2 $WK/worker-w2 main; (cd $WK/worker-w2 && print e > e.txt && git add e.txt && git commit -qm w2)
# w3 eigener Commit nicht in main → bleibt
git worktree add -q -b pruef/worker-w3 $WK/worker-w3 main; (cd $WK/worker-w3 && print f > f.txt && git add f.txt && git commit -qm w3)
# w4 repo.conf anders als im Repo → bleibt
git worktree add -q -b pruef/worker-w4 $WK/worker-w4 main; print 'repo=anders' > $WK/worker-w4/repo.conf
# w5 ohne Zweig (neue Worker), leer → weg
git worktree add -q --detach $WK/worker-w5 main
# Zweige ohne Arbeitskopie: Worker-Zweig per cherry-pick in main → lokal und auf GitHub weg; anderer Präfix → bleibt
git branch pruef/worker-gepickt main; git branch pruef/anders-gepickt main
git worktree add -q $T/tmp-g pruef/worker-gepickt; (cd $T/tmp-g && print g > g.txt && git add g.txt && git commit -qm gepickt-g); git worktree remove $T/tmp-g
git worktree add -q $T/tmp-h pruef/anders-gepickt; (cd $T/tmp-h && print h > h.txt && git add h.txt && git commit -qm gepickt-h); git worktree remove $T/tmp-h
git cherry-pick pruef/worker-w2 pruef/worker-gepickt pruef/anders-gepickt >/dev/null && git push -q origin main 2>/dev/null
git push -q origin pruef/worker-gepickt pruef/worker-w3 2>/dev/null
for n in 1 2 3 4 5; do alt $WK/worker-w$n; done
# Zweige: lokal und auf GitHub
git branch pruef/fertig main
git branch claude/eigen worktree-agent-a3
git push -q origin main:pruef/fertig worktree-agent-a3:claude/eigen main:rest/offen-pr 2>/dev/null
git fetch -q origin
print rest/offen-pr > $T/prs
# Sperrdateien
mkdir $T/nacht
pid_tot=99999; while ps -p $pid_tot >/dev/null 2>&1; do pid_tot=$((pid_tot - 1)); done
print $pid_tot > $T/nacht/tot-alt.lock; touch -t 202601010000 $T/nacht/tot-alt.lock
print $pid_tot > $T/nacht/tot-jung.lock
print $$ > $T/nacht/lebt.lock; touch -t 202601010000 $T/nacht/lebt.lock

export HALO_NACHT_DIR=$T/nacht HALO_CLAUDE_PROJEKTE=$T/proj HALO_AUFR_PRS=$T/prs LOG=$T/log HALO_WORKER_DIR=$WK
vorher=$(git -C $R worktree list | wc -l)
TR=$(zsh $SKRIPT --trocken $R 2>&1)
pruefe "Probelauf: nichts entfernt" '[[ $(git -C $R worktree list | wc -l) == $vorher && -e $T/nacht/tot-alt.lock && ! -e $LOG ]]'
pruefe "Probelauf: listet Kopie 1" '[[ $TR == *"Arbeitskopie "*agent-a1* ]]'
AUS=$(zsh $SKRIPT $R 2>&1)
pruefe "Kopie ohne Änderungen → entfernt, Zweig gelöscht" '[[ ! -d $W/agent-a1 ]] && ! git -C $R rev-parse -q --verify worktree-agent-a1 >/dev/null'
pruefe "Kopie mit ungespeicherter Änderung → bleibt" '[[ -d $W/agent-a2 && $AUS == *agent-a2:\ ungespeichert* ]]'
pruefe "Kopie mit Commit nur dort → bleibt" '[[ -d $W/agent-a3 && $AUS == *agent-a3:\ 1\ Commit* ]]'
pruefe "Kopie nur mit erzeugten ignorierten Dateien → entfernt" '[[ ! -d $W/agent-a4 ]]'
pruefe "Kopie mit nicht ersetzbarer ignorierter Datei → bleibt" '[[ -d $W/agent-a5 && $AUS == *vorschau-1.png* ]]'
pruefe "Kopie gesperrt von lebendem Prozess → bleibt" '[[ -d $W/agent-a6 && $AUS == *"laufendem Prozess $$"* ]]'
pruefe "Kopie mit gepicktem Commit → entfernt, Zweig bleibt" '[[ ! -d $W/agent-a7 ]] && git -C $R rev-parse -q --verify worktree-agent-a7 >/dev/null'
pruefe "frische Kopie → bleibt" '[[ -d $W/agent-a8 && $AUS == *agent-a8:\ Änderung\ jünger* ]]'
pruefe "frisches Protokoll des Hilfsagenten → bleibt" '[[ -d $W/agent-a9 && $AUS == *agent-a9:\ Hilfsagent* ]]'
pruefe "Prozess arbeitet in der Kopie → bleibt" '[[ -d $W/agent-a10 && $AUS == *agent-a10:\ ein\ Prozess* ]]'
pruefe "tote alte Sperrdatei → entfernt" '[[ ! -e $T/nacht/tot-alt.lock ]]'
pruefe "tote junge Sperrdatei → bleibt" '[[ -e $T/nacht/tot-jung.lock ]]'
pruefe "Sperrdatei lebender Prozess → bleibt" '[[ -e $T/nacht/lebt.lock ]]'
pruefe "lokaler Zweig in main → gelöscht" '! git -C $R rev-parse -q --verify pruef/fertig >/dev/null'
pruefe "lokaler Zweig mit eigenem Commit → bleibt" 'git -C $R rev-parse -q --verify claude/eigen >/dev/null'
pruefe "GitHub-Zweig in main → gelöscht" '! git -C $T/origin.git rev-parse -q --verify pruef/fertig >/dev/null'
pruefe "GitHub-Zweig mit eigenem Commit → bleibt" 'git -C $T/origin.git rev-parse -q --verify claude/eigen >/dev/null'
pruefe "GitHub-Zweig mit offenem Pull Request → bleibt" 'git -C $T/origin.git rev-parse -q --verify rest/offen-pr >/dev/null'
pruefe "Protokoll: eine Zeile je Entfernung" '(( $(grep -c "AUFRÄUMEN entfernt" $LOG) == $(print -r -- $AUS | sed -n "/^Aufgeräumt/,/^Rest/p" | grep -c "^- ") ))'
 ist() { git -C $R rev-parse -q --verify $1 >/dev/null }
pruefe "Probelauf: listet leere Worker-Kopie" '[[ $TR == *"Arbeitskopie "*worker-w1* ]]'
pruefe "Worker: leere Kopie (repo.conf wie im Repo) → entfernt, Zweig gelöscht" '[[ ! -d $WK/worker-w1 ]] && ! ist pruef/worker-w1'
pruefe "Worker: Commit per cherry-pick in main → entfernt, Zweig gelöscht (Patch-Vergleich)" '[[ ! -d $WK/worker-w2 ]] && ! ist pruef/worker-w2 && [[ $AUS == *worker-w2*Patch-Vergleich* ]]'
pruefe "Worker: eigener Commit → bleibt" '[[ -d $WK/worker-w3 && $AUS == *worker-w3:\ 1\ Commit* ]] && ist pruef/worker-w3'
pruefe "Worker: repo.conf anders als im Repo → bleibt" '[[ -d $WK/worker-w4 && $AUS == *worker-w4:\ ignorierte\ Datei*repo.conf* ]]'
pruefe "Worker: Kopie ohne Zweig, leer → entfernt" '[[ ! -d $WK/worker-w5 ]]'
pruefe "Worker-Zweig ohne Kopie, per cherry-pick in main → lokal gelöscht" '! ist pruef/worker-gepickt'
pruefe "Worker-Zweig auf GitHub, per cherry-pick in main → gelöscht" '! git -C $T/origin.git rev-parse -q --verify pruef/worker-gepickt >/dev/null'
pruefe "Worker-Zweig auf GitHub mit eigenem Commit → bleibt" 'git -C $T/origin.git rev-parse -q --verify pruef/worker-w3 >/dev/null'
pruefe "anderer Präfix per cherry-pick in main → bleibt (nur Vorfahr zählt)" 'ist pruef/anders-gepickt'
pruefe "Arbeitsbaum von main unverändert" '[[ -z $(git -C $R status --porcelain) ]]'
(( fehler )) && { print -r -- "--- Ausgabe ---"; print -r -- $AUS }
exit $fehler
