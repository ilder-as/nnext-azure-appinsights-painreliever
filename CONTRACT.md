# Data contract — Event Analytics

The `extract-events` skill writes JSON into `app/public/data/` (served at
`./data/*.json`). The React dashboard loads only these files and computes every
aggregate client-side (`app/src/lib/aggregate.ts`). Nothing is app-specific — all
custom dimensions live in `props` and the dashboard **discovers** its breakdown /
filter axes from the data (`app/src/lib/dimensions.ts`).

## `data/events.json`

A JSON **array** of event objects, newest first. ~30k–65k rows depending on window.

```jsonc
{
  "timestamp": "2026-06-04T11:29:48.967Z", // ISO8601 UTC
  "name": "SearchPerformed", // customEvent name
  "userId": "Qsv+I3Pbahh1xiqVNhKYKE", // anonymous AI user_Id (always present)
  "authId": "user@example.com", // authenticated user — may be null
  "sessionId": "bdD3NAcIRofltfrUGymAR7", // may be null
  "operation": "/route", // operation_Name (route/page) — may be null
  "city": "Oslo", // may be null
  "country": "Norway", // may be null
  "browser": "Chrome 148.0", // may be null
  "os": "Linux", // may be null
  "deviceType": "Browser", // may be null
  "props": {
    /* full customDimensions, varies by event/project */
  },
}
```

Notes for consumers:

- Every string field except `userId`/`name`/`timestamp` may be `null` — render defensively.
- There are **no app-specific fields** — anything project-specific (a project id, a
  status, a category…) is just a `props` key. `props` is always present (may be `{}`).
- The dashboard auto-discovers good breakdown dimensions from `props` (bounded
  cardinality, decent coverage), excluding noise (`environment`/`language`/`timezone`).

## `data/meta.json`

```jsonc
{
  "generatedAt": "2026-06-04T11:31:19Z",
  "resource": "my-appinsights-name", // resource the data was pulled from (shown in UI)
  "resourceId": "/subscriptions/…/components/my-appinsights-name",
  "windowDays": 30,
  "from": "2026-05-05T…",
  "to": "2026-06-04T…",
  "totalEvents": 34276,
  "eventTypes": ["EventA", "EventB", ...]
}
```

## `data/exceptions.json` (optional — for the session trace)

JS errors from the App Insights `exceptions` table, used as red markers in session
timelines. **Optional**: the app loads it best-effort and omits error markers if
absent or empty. Array, newest-first:

```jsonc
{
  "timestamp": "2026-06-04T09:20:20.4Z",
  "sessionId": "aO5emlXrqDGO...", // joins to events by sessionId
  "userId": "wJVnDmwf...",
  "authId": "user@example.com", // may be null
  "operation": "/", // route — may be null
  "type": "Error",
  "message": "innermost (or outer) message", // may be null
  "problemId": "...", // may be null
  "browser": "Mobile Safari 26.5",
  "os": "iOS 18.7",
}
```
