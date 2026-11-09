#!/bin/zsh
# Liest das Kontingent (Woche und 5 Stunden) aus dem rate_limit_event eines winzigen Haiku-Aufrufs.
# Ausgabe: eine Zeile „Woche 88 % (Zurücksetzen 01:00), 5 Stunden 24 %, Status allowed_warning“.
# Schreibt zusätzlich ~/halo-nacht/kontingent.json. Exitcode 1, wenn nichts gelesen werden konnte.
cd /tmp || exit 1
roh=$(timeout 90 claude -p "ok" --model haiku --output-format stream-json --verbose 2>/dev/null | grep '"rate_limit_event"' | head -1)
[ -n "$roh" ] || { echo "KONTINGENT: nicht lesbar"; exit 1; }
print -r -- "$roh" | /usr/bin/python3 -c '
import sys,json,os,time
e=json.loads(sys.stdin.read())["rate_limit_info"]
w=e.get("unifiedWindows",{})
wo=w.get("seven_day",{}); h=w.get("five_hour",{})
p=os.path.expanduser("~/halo-nacht/kontingent.json")
os.makedirs(os.path.dirname(p),exist_ok=True)
json.dump({"stand":time.strftime("%Y-%m-%dT%H:%M:%S%z"),"info":e},open(p,"w"))
reset=time.strftime("%H:%M",time.localtime(wo.get("resetsAt",e.get("resetsAt",0))))
print("Woche %d %% (Zurücksetzen %s), 5 Stunden %d %%, Status %s"%(round(100*wo.get("utilization",e.get("utilization",0))),reset,round(100*h.get("utilization",0)),wo.get("status",e.get("status"))))
'
