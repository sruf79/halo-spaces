#!/bin/zsh
# Braucht eine Änderung einen CI-Lauf? Nur Änderungen, die Thunderbird direkt
# betreffen (Entscheidung des Maintainers vom 6.11.2026, Wortlaut: „ab sofort
# benötigen änderungen an den .md files oder an den settings der sessions
# keinerlei CI lauf mehr. alle änderungen, die nichts mit thunderbird direkt zu
# tun haben, benötigen keinen ci lauf mehr“). Gleiche Liste wie `paths:` in
# .github/workflows/test.yml – bei Änderungen beide anpassen.
#   tests/ci-noetig.sh <von> [<bis>]   Exitcode 0: CI nötig, 1: nicht nötig
setopt err_return
cd ${0:A:h:h}
VON=$1 BIS=${2:-HEAD}
[[ -n $VON ]] || { print -u2 "Aufruf: tests/ci-noetig.sh <von> [<bis>]"; exit 2 }
git diff --name-only "$VON" "$BIS" | grep -E '^(extension|chrome|icons)/|^build\.sh$|^tests/(halo_test\.py|perf\.js|update_test\.py|testserver\.py|adressen\.py|addon_lint\.py|logik/)' \
  | grep -vE '\.md$' | grep -q .
