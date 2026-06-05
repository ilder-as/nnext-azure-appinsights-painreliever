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

## Get started — just ask Claude (recommended)

This repo is wired for [Claude Code](https://claude.com/claude-code). Open it and
ask, in plain English:

> **"Extract the data and start the project."**

Claude runs the bundled **`extract-events`** skill end to end:

1. **Sets up local config** — on first run it creates a gitignored `.azure-target`
   file (Azure tenant / subscription / resource). It walks you through discovery:
   which tenant holds the App Insights resource, which component has the events —
   and remembers it, so later runs are one step.
2. **Logs you into Azure** — the resource may be in a non-default Entra tenant, so
   Claude will ask you to run an interactive `az login --tenant …` (MFA). Just
   paste the command it gives you with a leading `!` in the Claude prompt.
3. **Pulls the telemetry** into `app/public/data/` (events, exceptions, meta) and
   reports the counts.
4. **Starts the dashboard** — `cd app && pnpm install && pnpm dev`.

A fresh clone ships **no data** (telemetry is gitignored — see Data privacy), so
the dashboard shows a "no data" screen until you run the extract. That's expected.

You'll need: the [Azure CLI](https://learn.microsoft.com/cli/azure/) (`az`) with
read access to the target resource, `python3`, and `pnpm`.

## Manual quick start

If you'd rather drive it yourself:

```bash
# 1. Configure + extract (first run creates .azure-target, then pulls data)
#    Follow .claude/skills/extract-events/SKILL.md — it's a copy-pasteable runbook.
cp .azure-target.example .azure-target   # then fill in tenant / subscription / App-ID
# … az login --tenant <id>; az account set --subscription <id> …

# 2. Run the app
cd app
pnpm install
pnpm dev            # → http://localhost:5199/ (or next free port)
```

Other scripts: `pnpm build` (typecheck + production bundle), `pnpm preview`
(serve the build), `pnpm typecheck`. After re-extracting, hit **Refresh** in the
app — it re-reads `./data/*.json` in place, preserving your filters.

## Extracting / refreshing data

The **`extract-events` skill** is the source of truth (`.claude/skills/extract-events/SKILL.md`)
— a self-contained runbook you can let Claude run or paste into a terminal. It
writes `app/public/data/{events.json,meta.json,exceptions.json}`. Only deps: an
authenticated `az` CLI (it auto-installs the `application-insights` extension) and
`python3`.

- **Local config (`.azure-target`)** — gitignored, holds the target tenant /
  subscription / App-ID GUID (these are environment-specific and kept out of git).
  Created automatically on first run; `.azure-target.example` is the template.
- **Non-default tenant** — if the resource lives in another Entra tenant, the skill
  has you `az login --tenant <id>` first (interactive). After that the App-ID is
  also remembered in the gitignored `.source`.
- **Repoint to any project** — edit `.azure-target` (or pass `APP=<resource-id-or-App-ID>`)
  and re-run. One project at a time; the resource name shows in the UI from
  `meta.resource`.
- **`WINDOW_DAYS`** controls the window (default 30).

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

`.azure-target` and `.source` hold environment-specific Azure identifiers
(tenant / subscription / resource App-ID) and are likewise git-ignored — only the
placeholder **`.azure-target.example`** is tracked. Never hard-code these into
tracked files.
