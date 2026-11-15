# gh_wdh: gh aufrufen und bei GitHub-Abfragelimit („API rate limit exceeded“, „secondary rate limit“,
# „was submitted too quickly“) warten und wiederholen statt aufzugeben. Wartezeit: bis zum Reset laut
# gh api rate_limit (graphql bzw. core, je nach Aufruf) plus 5 s, beim Zweitlimit 60 s; höchstens
# GH_WDH_MAX_S Sekunden je Pause (Standard 900) und GH_WDH_VERSUCHE Versuche (Standard 3). Andere Fehler
# gibt es sofort weiter (Ausgabe, Fehlerausgabe und Exitcode wie gh).
# Anlass: Abfragelimit in 4 Nächten (W46), Board „nicht lesbar“ bzw. Notiz mit Hash verloren (Wochenprüfung W46).
# Wird von board.sh, ci-waechter.sh und ci-runde.zsh eingebunden (Kopie in ~/.config/halo-spaces/).
GH_WDH_VERSUCHE=${GH_WDH_VERSUCHE:-3}
GH_WDH_MAX_S=${GH_WDH_MAX_S:-900}
GH_WDH_BEFEHL=${GH_WDH_BEFEHL:-gh}           # (Tests: gefälschtes gh)
gh_wdh_limit() {   # <Fehlerausgabe>: 0, wenn sie ein Abfragelimit meldet
  [[ ${1:l} == *(api rate limit exceeded|secondary rate limit|rate limit exceeded|submitted too quickly)* ]]
}
gh_wdh_pause() {   # <Fehlerausgabe> <graphql|core>: Sekunden bis zum Reset (+5), beim Zweitlimit 60, höchstens GH_WDH_MAX_S
  local s=60 reset
  if [[ ${1:l} != *secondary* && ${1:l} != *"too quickly"* ]]; then
    reset=$($GH_WDH_BEFEHL api rate_limit --jq ".resources.$2.reset" 2>/dev/null)
    [[ $reset == <-> ]] && s=$(( reset - $(date +%s) + 5 ))
  fi
  (( s < 5 )) && s=5
  (( s > GH_WDH_MAX_S )) && s=$GH_WDH_MAX_S
  print $s
}
gh_wdh() {
  emulate -L zsh
  setopt extendedglob
  local v=1 rc fe aus art=core s
  [[ $1 == project || " $* " == *" graphql "* ]] && art=graphql
  fe=$(mktemp -t gh-wdh) || { $GH_WDH_BEFEHL "$@"; return }
  while true; do
    aus=$($GH_WDH_BEFEHL "$@" 2>$fe); rc=$?
    if (( rc == 0 )) || ! gh_wdh_limit "$(<$fe)" || (( v >= GH_WDH_VERSUCHE )); then
      [[ -n $aus ]] && print -r -- $aus
      cat $fe >&2; rm -f $fe
      return $rc
    fi
    s=$(gh_wdh_pause "$(<$fe)" $art)
    print -ru2 -- "gh: Abfragelimit ($art) – Versuch $v von $GH_WDH_VERSUCHE, warte $s s"
    sleep $s
    v=$((v + 1))
  done
}
