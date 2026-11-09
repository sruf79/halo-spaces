#!/bin/zsh
# Pull Requests nach dem Release schließen – nur mit Freigabe des Maintainers in tests/pr-freigaben.txt
# (Entscheidung des Maintainers vom 9.11.2026, Wortlaut in ENTSCHEIDUNGEN.md; docs/github-komm.md).
# Ohne Claude, nur git, gh, jq. publish.sh ruft das Skript nach dem geprüften Release auf (gleich nach
# dem Schließen der Issues); Fehler halten das Release nie auf, sie stehen als „FEHLER“ im Bericht.
#
#   pr-schliessen.sh <version> [--trocken]   --trocken: nur anzeigen (mit Kommentartext), nichts ändern
#
# Geschlossen wird ein Pull Request nur, wenn ALLES zutrifft:
#   - Zeile in tests/pr-freigaben.txt (PR-Nr | Issue-Nr | Datum | Zitat des Maintainers mit Herkunft),
#   - der PR liegt in sruf79/halo-spaces, ist offen, kein Entwurf, ohne Label „hold“,
#   - ein voller Fix-Commit „(GitHub #<Issue-Nr>)“ liegt in diesem Release (vorheriges Tag..v<version>;
#     Teil-Fixe und zurückgenommene Commits zählen nicht, wie tests/issue-abgleich.sh).
# Dann: englischer Dank-Kommentar (fester Text, nur Version und Autorname aus der API, nie Text aus dem
# PR), PR schließen (nie mergen, Zweig bleibt), Zeile nach tests/pr-freigaben-erledigt.txt verschieben
# und beide Dateien lokal committen (nicht pushen; der nächste Push nimmt den Commit mit).
#
# Ausgabe je PR eine Zeile:
#   geschlossen #p (Issue #i, Autor a) | würde schließen #p … | FEHLER #p: …
#   wartet #p (Issue #i nicht in diesem Release) | ohne Issue #p | hold #p | schon zu #p | kein PR #p
#   fremdes Repo #p | ungültig Zeile n | doppelt #p
#   kandidat #p (Closes #i, in diesem Release; nicht freigegeben, nur Hinweis)
#   nicht freigegeben #p (offen, nicht in der Liste)
# Rückgabe 1 bei einem FEHLER, sonst 0.
# Proben: HALO_REPO (Repo), HALO_PR_FREIGABEN, HALO_PR_ERLEDIGT (Listen), HALO_PR_BEREICH (<von>..<bis>
# statt Tag-Suche). Test ohne Netz: zsh tests/pr_schliessen_test.zsh (lädt mit PS_NUR_FUNKTIONEN=1).
# GitHub-Routinen schließen nie Pull Requests; nur dieses Skript, nur aus publish.sh.

PS_R=sruf79/halo-spaces
PS_REPO=${HALO_REPO:-${${(%):-%x}:A:h:h}}
PS_LISTE=${HALO_PR_FREIGABEN:-$PS_REPO/tests/pr-freigaben.txt}
PS_ERLEDIGT=${HALO_PR_ERLEDIGT:-$PS_REPO/tests/pr-freigaben-erledigt.txt}
# ia_commits_holen, ia_fixes (Fix-Nummern wie beim Schließen der Issues)
HALO_REPO=$PS_REPO IA_NUR_FUNKTIONEN=1 source ${${(%):-%x}:A:h}/issue-abgleich.sh

# --- reine Auswertung (Daten aus Dateien) ---

# Freigabeliste → JSON [{pr, issue (Zahl oder null), datum, zeile}]; Fehler als {fehler: "…"}
ps_liste_lesen() {   # <Datei>
  [[ -f $1 ]] || { print '[]'; return }
  awk '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    { nr++ } /^[ \t]*(#|$)/ { next }
    { n = split($0, f, "|"); zitat = ""
      for (k = 4; k <= n; k++) zitat = zitat (k > 4 ? "|" : "") f[k]
      pr = trim(f[1]); is = trim(f[2]); sub(/^#/, "", pr); sub(/^#/, "", is); zitat = trim(zitat)
      if (n < 4 || pr !~ /^[0-9]+$/ || (is !~ /^[0-9]+$/ && is != "-") || trim(f[3]) == "" || zitat !~ /[„“"]/) {
        printf "{\"fehler\": \"ungültig Zeile %d\"}\n", nr; next }
      if (seen[pr]++) { printf "{\"fehler\": \"doppelt #%s\"}\n", pr; next }
      printf "{\"pr\": %s, \"issue\": %s, \"zeile\": %d}\n", pr, (is == "-" ? "null" : is), nr }' $1 | jq -s .
}

# Auswahl → Zeilen „schliessen <p> <i> <autor>“ bzw. Bericht (siehe Kopf)
# prs.json: {"<p>": {state, draft, repo, autor, labels: [..]}} (fehlt = kein PR);
# offen.json: [{number, issues: [..]}] (offene PRs mit verknüpften bzw. „Closes #n“-Issues)
ps_auswahl() {   # <liste.json> <fix-Nummern als JSON-Array> <prs.json> <offen.json>
  jq -r --argjson fix "$2" --slurpfile p $3 --slurpfile o $4 --arg r $PS_R '
    ($p[0]) as $prs | ($o[0]) as $offen
    | ([.[] | .pr // empty]) as $gelistet
    | (.[] | if .fehler then .fehler else
        . as $e | ($prs[$e.pr | tostring]) as $pr
        | if $pr == null then "kein PR #\($e.pr)"
          elif $pr.repo != $r then "fremdes Repo #\($e.pr)"
          elif $pr.state != "open" then "schon zu #\($e.pr)"
          elif $pr.draft or any($pr.labels[]?; test("hold"; "i")) then "hold #\($e.pr)"
          elif $e.issue == null then "ohne Issue #\($e.pr)"
          elif any($fix[]; . == $e.issue) | not then "wartet #\($e.pr) (Issue #\($e.issue) nicht in diesem Release)"
          else "schliessen \($e.pr) \($e.issue) \(if ($pr.autor // "") | test("^[A-Za-z0-9](-?[A-Za-z0-9]){0,38}$") then $pr.autor else "-" end)"
          end end),
      ($offen[] | . as $o | select(any($gelistet[]; . == $o.number) | not)
        | [$o.issues[]? | select(. as $i | any($fix[]; . == $i))] as $k
        | if ($k | length) > 0 then "kandidat #\($o.number) (Closes \($k | map("#\(.)") | join(", ")), in diesem Release; nicht freigegeben, nur Hinweis)"
          else "nicht freigegeben #\($o.number) (offen, nicht in der Liste)" end)' $1
}

# Text des Kommentars (englisch, fest; nur Version und Autorname, beide geprüft)
ps_text() {   # <version> <autor oder -> <genannt: 1/leer>
  local dank="Thank you very much!"
  [[ $2 != - ]] && dank="Thank you very much, $2!"
  print -r -- "Quick update: this is now part of release $1, which Thunderbird installs automatically.${3:+ We built it in our own code, and your work is credited in the commit.} $dank We're closing this pull request now, since the change has landed."
}

# Autor in einer Zeile „Co-Authored-By:“ der Commits im Bereich genannt (Login oder Name)?
ps_genannt() {   # <Bereich> <login> [Name]
  local co=$(git -C $PS_REPO log --format=%b $1 2>/dev/null | grep -i '^co-authored-by:')
  [[ $2 != - ]] && print -r -- $co | grep -qiF -- $2 && return 0
  [[ -n $3 ]] && print -r -- $co | grep -qiF -- $3
}

# Zeile des PR aus der Liste in die Erledigt-Liste verschieben
ps_erledigt() {   # <pr> <version>
  local zeile=$(awk -v p=$1 -F'|' '{ x = $1; gsub(/[ \t#]/, "", x) } x == p { print; exit }' $PS_LISTE)
  [[ -n $zeile ]] || return 1
  awk -v p=$1 -F'|' '{ x = $1; gsub(/[ \t#]/, "", x) } x == p && !d { d = 1; next } { print }' $PS_LISTE > $PS_LISTE.tmp &&
    mv $PS_LISTE.tmp $PS_LISTE &&
    print -r -- "$zeile | erledigt $(date +%Y-%m-%d) in $2" >> $PS_ERLEDIGT
}

# --- Ablauf ---
ps_lauf() {   # <version> [--trocken]
  emulate -L zsh
  setopt pipe_fail
  local version=$1 trocken=$2 bereich alt tmp n z p i a name fehler=0 erledigt=()
  [[ $version =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]] || { print "FEHLER Version „$version“"; return 1 }
  tmp=$(mktemp -d) || return 1
  {
    bereich=$HALO_PR_BEREICH
    if [[ -z $bereich ]]; then
      git -C $PS_REPO fetch -q --tags origin 2>/dev/null || true
      if git -C $PS_REPO rev-parse -q --verify "v$version^{commit}" >/dev/null; then
        alt=$(git -C $PS_REPO tag -l 'v[0-9]*' --sort=-v:refname | grep -A1 -x "v$version" | sed -n 2p)
        bereich="$alt..v$version"
      else
        alt=$(git -C $PS_REPO tag -l 'v[0-9]*' --sort=-v:refname | head -1)
        bereich="$alt..HEAD"
      fi
      [[ -n $alt ]] || { print "FEHLER kein Release-Tag vor v$version"; return 1 }
    fi
    ia_commits_holen $bereich > $tmp/c.tsv || { print "FEHLER git log $bereich"; return 1 }
    ia_fixes $tmp/c.tsv | cut -d' ' -f1 | sort -un | jq -sc . > $tmp/fix.json
    ps_liste_lesen $PS_LISTE > $tmp/liste.json || { print "FEHLER Liste $PS_LISTE unlesbar"; return 1 }
    print -r -- '{}' > $tmp/prs.json
    for n in $(jq -r '.[] | .pr // empty' $tmp/liste.json); do
      if ! gh api repos/$PS_R/pulls/$n > $tmp/pr.json 2>$tmp/err; then
        grep -q 'Not Found\|404' $tmp/err && continue
        print "FEHLER #$n: nicht lesbar"; fehler=1; continue
      fi
      jq --arg n $n --slurpfile x $tmp/pr.json '. + {($n): ($x[0] | {state, draft, repo: .base.repo.full_name,
        autor: .user.login, labels: [.labels[]?.name]})}' $tmp/prs.json > $tmp/prs.neu && mv $tmp/prs.neu $tmp/prs.json
    done
    if ! gh pr list -R $PS_R --state open --limit 200 --json number,closingIssuesReferences,body > $tmp/o.roh 2>$tmp/err; then
      print "FEHLER offene PRs nicht lesbar (Kandidaten fehlen)"; fehler=1; print -r -- '[]' > $tmp/o.roh
    fi
    # Nummern aus „Closes/Fixes/Resolves #n“ nur auslesen, den Text nie ausgeben
    jq '[.[] | {number, issues: ([.closingIssuesReferences[]?.number]
      + [(.body // "") | scan("(?i)\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+#([0-9]+)") | .[0] | tonumber] | unique)}]' \
      $tmp/o.roh > $tmp/offen.json
    ps_auswahl $tmp/liste.json "$(<$tmp/fix.json)" $tmp/prs.json $tmp/offen.json > $tmp/a.txt || { print "FEHLER Auswertung"; return 1 }
    while read -r z; do
      [[ $z == schliessen\ * ]] || { print -r -- $z; continue }
      read -r z p i a <<< $z
      name=
      [[ $a != - ]] && name=$(gh api users/$a 2>/dev/null | jq -r '.name // ""' 2>/dev/null)
      local text=$(ps_text $version $a "$(ps_genannt $bereich $a "$name" && print 1)")
      if [[ $trocken == --trocken ]]; then
        print "würde schließen #$p (Issue #$i, Autor $a)"
        print -r -- "  Text: $text"
        continue
      fi
      # unmittelbar vorher nochmals: offen und im richtigen Repo
      if [[ $(gh api repos/$PS_R/pulls/$p 2>/dev/null | jq -r '"\(.state) \(.base.repo.full_name)"') != "open $PS_R" ]]; then
        print "FEHLER #$p: nicht mehr offen bzw. nicht lesbar, nichts getan"; fehler=1; continue
      fi
      if gh pr close $p -R $PS_R --comment "$text" >/dev/null 2>$tmp/err; then
        print "geschlossen #$p (Issue #$i, Autor $a)"
        if ps_erledigt $p $version; then erledigt+=($p); else print "FEHLER #$p: geschlossen, Zeile nicht nach ${PS_ERLEDIGT:t} verschoben"; fehler=1; fi
      else
        print "FEHLER #$p: $(head -1 $tmp/err)"; fehler=1
      fi
    done < $tmp/a.txt
    if (( $#erledigt )); then
      if git -C $PS_REPO add -- $PS_LISTE $PS_ERLEDIGT 2>/dev/null &&
         git -C $PS_REPO commit -q -m "Release: PR #${(j:, #:)erledigt} nach dem Release $version geschlossen (Freigabeliste)" -- $PS_LISTE $PS_ERLEDIGT; then
        print "Freigabeliste committet (nicht gepusht): $(git -C $PS_REPO rev-parse --short HEAD)"
      else
        print "FEHLER Freigabeliste nicht committet – ${PS_LISTE:t} und ${PS_ERLEDIGT:t} von Hand committen"; fehler=1
      fi
    fi
    return $fehler
  } always { rm -rf $tmp }
}

[[ -n $PS_NUR_FUNKTIONEN ]] && return 0
emulate -L zsh
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
ia_gh_token
[[ -n $1 && ( -z $2 || $2 == --trocken ) ]] || { sed -n '/^#   pr-schliessen/p' $0 | sed 's/^# *//'; exit 2 }
ps_lauf $1 $2
exit $?
