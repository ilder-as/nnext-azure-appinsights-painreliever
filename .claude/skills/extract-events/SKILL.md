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

## Step 1 — Local config (`.azure-target`) — auto-created on first run

The target tenant / subscription / App-ID are **environment-specific and may be
sensitive**, so they are NOT hard-coded in this skill. They live in a gitignored
file **`.azure-target`** at the repo root. Run this bootstrap first — it ensures
the file is gitignored and **sources it if present**:

```bash
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
# Make sure local config + exports never get committed (idempotent).
for p in .azure-target .source app/public/data/; do
  grep -qxF "$p" .gitignore 2>/dev/null || printf '%s\n' "$p" >> .gitignore
done
if [ -f .azure-target ]; then
  set -a; . ./.azure-target; set +a       # exports AZ_TENANT, AZ_SUBSCRIPTION, APP
  echo "Loaded .azure-target → tenant=${AZ_TENANT:-?} sub=${AZ_SUBSCRIPTION:-?} app=${APP:+set}"
else
  echo "NO .azure-target yet → first run: discover it (Step 1a), then write it (Step 1b)."
fi
```

**If `.azure-target` exists**, log into its tenant (interactive — have the USER
run it) and select the subscription, then skip to Step 3 (`APP` is already set):

```bash
az login --tenant "$AZ_TENANT"             # MFA; user runs via `! az login --tenant …`
az account set --subscription "$AZ_SUBSCRIPTION"
```

### Step 1a — Discover (first run only)

The resource may be in a **non-default Entra tenant**, so a fresh `az login
--tenant <id>` is usually required (the default login often has no App Insights).
Drive the user through it:

1. Ask the user which **tenant** (and, if known, subscription) holds the App
   Insights resource. If unknown, `az account list -o table` shows what the
   current login can see; a different tenant needs `az login --tenant <id>` first.
   The login is interactive (MFA) — have the user run it: `! az login --tenant <id>`.
2. Set the subscription: `az account set --subscription <id>`.
3. List App Insights components and pick the one with `customEvents` (an app/SPA
   resource, not an API backend). Note: the extension subcommand
   `az monitor app-insights component list` sometimes errors _"'list' not
   recognized"_ — the `az resource list` fallback is reliable:

   ```bash
   az resource list --resource-type microsoft.insights/components \
     --query "[].{name:name, rg:resourceGroup}" -o table
   ```

   If unsure which has events, count over a short window (replace NAME/RG):

   ```bash
   az monitor app-insights query --app NAME --resource-group RG --offset 7d \
     --analytics-query "customEvents | where timestamp > ago(7d) | summarize count()" -o tsv
   ```

4. Get its **App-ID GUID** (stable, works with `--app` without an RG):

   ```bash
   az resource show --name NAME --resource-group RG \
     --resource-type microsoft.insights/components --query "properties.AppId" -o tsv
   ```

### Step 1b — Write `.azure-target` (first run only)

Persist what you discovered so future runs skip all of the above. Fill the three
values from Step 1a:

```bash
ROOT="$(git rev-parse --show-toplevel)"
cat > "$ROOT/.azure-target" <<EOF
# Local Azure target for the extract-events skill — GITIGNORED, do not commit.
# Source before running:  set -a; . ./.azure-target; set +a
AZ_TENANT=<tenant-guid>
AZ_SUBSCRIPTION=<subscription-guid>
APP=<app-insights-app-id-guid>
EOF
echo "Wrote $ROOT/.azure-target — re-run Step 1 to load it."
```

A tracked **`.azure-target.example`** documents the format. After Step 1b, source
the file (Step 1 top) and continue. Repoint later by editing `.azure-target` (or
just re-run Step 1a/1b).

## Step 2 — Preflight

```bash
az account show -o table 2>/dev/null || echo "NOT LOGGED IN → run: az login --tenant <id>"
az extension show -n application-insights >/dev/null 2>&1 || az extension add -n application-insights
```

If not logged in, tell the user to `az login --tenant "$AZ_TENANT"` (MFA expires)
and stop. Confirm the active subscription matches `$AZ_SUBSCRIPTION` — the target
resource must be in it.

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
