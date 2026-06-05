---
name: extract-events
description: Pull custom-event telemetry from ANY Azure Application Insights project into the local Event Analytics dashboard. Triggers when the user says "extract event data", "refresh analytics data", "pull event analytics", "point the dashboard at <project>", "update the dashboard data", or "/extract-events".
---

# Extract Event Analytics data

Pulls `customEvents` (+ `exceptions`) from an Application Insights resource and
writes them to the dashboard's data dir
(`app/public/data/{events.json,meta.json,exceptions.json}`). The
dashboard reads those files and populates **dynamically** from whatever is there —
no app-specific assumptions. Its in-app **Refresh** re-reads without a reload.

Works for **any** project: the resource is configurable (env `APP`, a remembered
`.source`, or interactive pick). Only deps: an authenticated `az`
CLI (with read access to the target) and `python3`.

## Step 1 — Preflight

```bash
az account show -o table 2>/dev/null || echo "NOT LOGGED IN → run: az login --scope https://management.core.windows.net//.default"
az extension show -n application-insights >/dev/null 2>&1 || az extension add -n application-insights
```

If not logged in, tell the user to `az login` (MFA expires) and stop. Note the
active subscription — the target resource must be in it (or have them `az account
set` / `az login --tenant`).

## Step 2 — Choose the resource (if not already set)

`APP` may be a full resource id **or** an App-ID GUID. Resolution order: env `APP`
→ remembered `.source` → ask. To list what's available:

```bash
az monitor app-insights component list --query "[].{name:name, rg:resourceGroup, id:id}" -o table 2>/dev/null \
  || az resource list --resource-type microsoft.insights/components --query "[].{name:name, rg:resourceGroup, id:id}" -o table
```

Present the list, let the user pick, then run Step 3 with `APP=<their choice>`.

## Step 3 — Extract (one self-contained block)

`WINDOW_DAYS` defaults to 30. Pass `APP=…` (and optionally `WINDOW_DAYS=…`). The
block remembers the resource in `.source`, derives `meta.resource` dynamically, and
**refuses to overwrite `events.json` if 0 events come back** (guards against an
auth-expiry wipe). Same command works pasted into a terminal.

```bash
set -o pipefail
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/app/public/data"
SRC="$ROOT/.source"
APP="${APP:-}"
[ -z "$APP" ] && [ -f "$SRC" ] && APP="$(cat "$SRC")"
if [ -z "$APP" ]; then echo "Set APP=<resource-id-or-App-ID> (see Step 2 to list)." >&2; exit 1; fi
WINDOW_DAYS="${WINDOW_DAYS:-30}"
RESOURCE_NAME="$(basename "$APP")"
mkdir -p "$OUT"
echo "$APP" > "$SRC"
NDJSON="$(mktemp)"
PROJECT="customEvents | project timestamp, name, user_Id, user_AuthenticatedId, session_Id, operation_Name, client_City, client_CountryOrRegion, client_Browser, client_OS, client_Type, customDimensions"

echo "Extracting $WINDOW_DAYS day(s) from $RESOURCE_NAME ..." >&2
# Day-chunked: one query per day. --offset MUST cover the day window, else the CLI's
# ~1h default timespan intersects with (and nullifies) the `where`.
for ((d=1; d<=WINDOW_DAYS; d++)); do
  prev=$((d-1))
  before=$(wc -l < "$NDJSON" 2>/dev/null || echo 0)
  az monitor app-insights query --app "$APP" --offset "${d}d" \
    --analytics-query "$PROJECT | where timestamp between (ago(${d}d) .. ago(${prev}d))" -o json 2>/dev/null \
  | python3 -c '
import json,sys
raw=sys.stdin.read().strip()
if raw:
    try: t=json.loads(raw)["tables"][0]
    except Exception: t=None
    if t:
        cols=[c["name"] for c in t["columns"]]; idx={n:i for i,n in enumerate(cols)}
        def col(r,n):
            i=idx.get(n); return r[i] if i is not None else None
        for r in t["rows"]:
            dr=col(r,"customDimensions"); props={}
            if isinstance(dr,str) and dr:
                try: props=json.loads(dr)
                except Exception: props={}
            elif isinstance(dr,dict): props=dr
            rec={"timestamp":col(r,"timestamp"),"name":col(r,"name"),"userId":col(r,"user_Id"),"authId":col(r,"user_AuthenticatedId"),"sessionId":col(r,"session_Id"),"operation":col(r,"operation_Name"),"city":col(r,"client_City"),"country":col(r,"client_CountryOrRegion"),"browser":col(r,"client_Browser"),"os":col(r,"client_OS"),"deviceType":col(r,"client_Type"),"props":props if isinstance(props,dict) else {}}
            sys.stdout.write(json.dumps(rec,ensure_ascii=False)+"\n")
' >> "$NDJSON" || { echo "day $d FAILED (continuing)" >&2; continue; }
  printf 'day %2d/%d: %s events\n' "$d" "$WINDOW_DAYS" "$(( $(wc -l < "$NDJSON") - before ))" >&2
done

# Finalize events.json (array, newest-first) + meta.json (dynamic resource)
RESOURCE_NAME="$RESOURCE_NAME" RESOURCE_ID="$APP" python3 - "$NDJSON" "$OUT" "$WINDOW_DAYS" <<'PY'
import json,sys,os,datetime
nd,out,wd=sys.argv[1],sys.argv[2],int(sys.argv[3])
ev=[]
with open(nd,encoding="utf-8") as fh:
    for line in fh:
        line=line.strip()
        if line: ev.append(json.loads(line))
if not ev:
    sys.stderr.write("ERROR: 0 events — REFUSING to overwrite. Check az auth / resource / window.\n"); sys.exit(1)
ev.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
json.dump(ev,open(os.path.join(out,"events.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
types=sorted({e["name"] for e in ev if e.get("name")})
st=[e["timestamp"] for e in ev if e.get("timestamp")]
meta={"generatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"resource":os.environ.get("RESOURCE_NAME","App Insights"),"resourceId":os.environ.get("RESOURCE_ID",""),"windowDays":wd,"from":min(st) if st else None,"to":max(st) if st else None,"totalEvents":len(ev),"eventTypes":types}
json.dump(meta,open(os.path.join(out,"meta.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=2)
sys.stderr.write(str(len(ev))+" events, "+str(len(types))+" types -> "+out+"\n")
PY
rm -f "$NDJSON"

# Exceptions (small, optional → red markers in the session trace). 0 is valid.
az monitor app-insights query --app "$APP" --offset "${WINDOW_DAYS}d" \
  --analytics-query "exceptions | where timestamp > ago(${WINDOW_DAYS}d) | project timestamp, session_Id, user_Id, user_AuthenticatedId, operation_Name, type, outerMessage, innermostMessage, problemId, client_Browser, client_OS | order by timestamp desc" -o json 2>/dev/null \
| python3 -c '
import json,sys,os
out=sys.argv[1]; raw=sys.stdin.read().strip(); rows=[]
if raw:
    try: t=json.loads(raw)["tables"][0]
    except Exception: t=None
    if t:
        cols=[c["name"] for c in t["columns"]]; idx={n:i for i,n in enumerate(cols)}
        def col(r,n):
            i=idx.get(n); return r[i] if i is not None else None
        for r in t["rows"]:
            rows.append({"timestamp":col(r,"timestamp"),"sessionId":col(r,"session_Id"),"userId":col(r,"user_Id"),"authId":col(r,"user_AuthenticatedId"),"operation":col(r,"operation_Name"),"type":col(r,"type"),"message":col(r,"innermostMessage") or col(r,"outerMessage"),"problemId":col(r,"problemId"),"browser":col(r,"client_Browser"),"os":col(r,"client_OS")})
json.dump(rows,open(os.path.join(out,"exceptions.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
sys.stderr.write(str(len(rows))+" exceptions written\n")
' "$OUT"
```

## Step 4 — Report

Tell the user the resource, event/type counts, and window. If the dashboard is open
they can hit **Refresh**; otherwise `cd app && pnpm dev`.

## Notes

- Repoint by re-running with a new `APP=` (it updates `.source`). The dashboard
  always reads the current export — one project at a time.
- `app/public/data/` + `.source` are git-ignored — exports hold real user data
  (emails, search terms). Never commit.
- Only `customEvents` flow into this tool (it's event analytics); a project with
  none will be empty. See the `reference-appinsights-prod` memory for telemetry caveats.

```

```
