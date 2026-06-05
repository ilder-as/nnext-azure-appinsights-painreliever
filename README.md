# Event Analytics

A local, sentry-style analytics dashboard for the **custom events** of **any**
Azure Application Insights project (user-behaviour telemetry).

Point it at a resource you have `az` access to and it **populates dynamically** —
it auto-discovers the project's own breakdown/filter dimensions from the event
custom-dimensions, so there's nothing app-specific to configure. It exists because
the Application Insights portal is slow and awkward for actually _looking stuff up_:
a skill pulls events out via the Azure CLI into plain JSON, and a **React +
TypeScript (Vite)** app renders them in a fast, dark, explorable dashboard you run
on your machine.

## Stack

- **`app/`** — Vite + React 19 + TypeScript SPA (the dashboard). pnpm.
- **`extract-events` skill** — pulls telemetry from Application Insights into
  `app/public/data/`. See `.claude/skills/extract-events/`.
- **`CONTRACT.md`** — the JSON data contract the app consumes.

## Quick start

```bash
cd app
pnpm install
pnpm dev            # → http://localhost:5199/
```

The repo already ships with an extracted dataset in `app/public/data/`. To pull
fresh data, run the extraction skill (below), then hit **Refresh** in the app
(it re-reads `./data/*.json` in place, preserving your filters).

Other scripts: `pnpm build` (typecheck + production bundle), `pnpm preview`
(serve the build), `pnpm typecheck`.

## Extracting / refreshing data

Two equivalent ways — both write `app/public/data/{events.json,meta.json}`:

1. **Skill** (from Claude Code): say _"extract event data"_ / _"refresh analytics
   data"_ (or `/extract-events`). It runs the extraction and reports counts.
2. **Bash command**: the self-contained command lives in
   `.claude/skills/extract-events/SKILL.md` — paste it into a terminal. Only deps
   are an authenticated `az` CLI and `python3`.

**Point it at any project**: the skill lists your App Insights components and you
pick one (or pass `APP=<resource-id-or-App-ID>`); it remembers your choice in
`.source`. Re-run with a different `APP=` to repoint (one project
at a time). The resource name is shown in the UI from `meta.resource`.

Prereqs for extraction:

- Azure CLI logged in with read access to the target:
  `az login --scope https://management.core.windows.net//.default`
  (MFA expires periodically). The skill auto-installs the `application-insights`
  CLI extension if needed. The resource must be in your active subscription.
- `WINDOW_DAYS` controls the window (default 30).

## What the dashboard shows

- KPI cards: total events, unique (authenticated) users, sessions, event types,
  failures — each with a real per-metric daily sparkline.
- Events-over-time stacked by event type (with a stacked/total toggle).
- Event-type breakdown donut (click a type to filter everything).
- **Dynamic breakdowns** — country / browser / OS plus the project's own
  **auto-discovered custom dimensions** (whatever varies with bounded cardinality);
  click any value to filter every widget; active filters show as removable chips.
- Top users by event volume, and a live "recent failures" feed.
- **Events Explorer** — sortable, paginated table of every event; click a row for a
  detail drawer with all fields and the full, pretty-printed `props` JSON.
- Global filters (event type, any dimension value, free-text over
  user/operation/all props) that drive every widget at once, plus an in-app
  **Refresh**.

## Session trace ("replay")

The **Sessions** view (nav rail) traces a single user over time. App Insights has
no DOM recordings, so this is **not** a Sentry pixel/video replay — it's an
**event/action timeline**: pick a session and watch a **play/scrub-able** sequence
of the user's actions (searches, check-status updates, downloads, failures) with
route changes and relative timestamps. A scrubber with play/pause + 1×/2×/4×
advances a cursor (idle gaps compressed) synced to the breadcrumb list. JS errors
appear as red markers **when `exceptions.json` is present** (pulled by the
`extract-events` skill; the trace works without it). Clicking a user in **Top
Users** deep-links straight to that user's sessions.

## Architecture (app/src)

- `lib/` — pure, typed core: `dimensions.ts` (auto-discovers breakdown/filter
  axes from the data), `aggregate.ts` (single O(n) pass: per-dimension
  distributions, daily stacks, per-day distinct users/sessions, ~40 ms over 34k
  rows), `sessions.ts` (session trace), `format.ts`, `kpi.ts`, `chartOptions.ts`,
  `useECharts.ts`, `types.ts`.
- `state/dashboard.tsx` — `DashboardProvider` + `useDashboard()`: data load,
  filter state, memoized aggregate/dimensions/explorer/sessions, refresh.
- `components/` — presentational components; one dark theme in
  `styles/global.css`. Product name in `config.ts` (`APP_NAME`).

## ⚠️ Data privacy

`app/public/data/` contains **real production telemetry, including user email
addresses and search terms**. It is git-ignored and must never be committed.
The extract lives only on your machine.
