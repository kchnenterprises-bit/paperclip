# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB (only if you want a fresh DB; this deletes all data):

```sh
# Embedded DB lives under PAPERCLIP_HOME/instances/default/db (default: ~/.paperclip/instances/default/db)
rm -rf ~/.paperclip/instances/default/db
pnpm dev
```

**Running from this fork (dashboard using fork code):**  
The dashboard and API at `http://localhost:3100` are served by whatever process you started. To ensure you're running **this fork's** code: (1) Start the server from the **fork root**: `cd /path/to/paperclip-fork && pnpm dev`. (2) Open `http://localhost:3100/api/health` — in dev the response includes `devServerCwd`; it should be the path to this fork. If it points to another folder, the dashboard is running that code, not the fork.

**Keeping one data directory (comments / data “disappearing”):**  
If comments or data seem to vanish when you restart, the server may be picking a different config or home dir. To force a single data location, start the fork with explicit env and always use the same command:

```sh
cd /Users/andrewmcculloch/paperclip-fork
export PAPERCLIP_HOME="${PAPERCLIP_HOME:-$HOME/.paperclip}"
pnpm dev
```

Use the same `PAPERCLIP_HOME` every time (or leave it unset so it defaults to `~/.paperclip`). Do not mix `npx paperclipai` and `pnpm dev` without understanding which one uses which config; when in doubt, use only `pnpm dev` from the fork with the env above.

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep plan docs dated and centralized.
New plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Agent instructions and workspace (relative paths)

When an agent’s instructions file lives outside the server repo (e.g. in a separate `paperclip-workspace` directory), use **project workspace + relative path** for portability:

1. **Create a project** whose (primary) workspace has **Local folder** set to the directory that contains your agent instructions. In the UI: New project → set "Local folder" to that path. The path **must exist and be readable by the server process** when the run starts (same machine and user, or mounted volume). Paths starting with `~` are resolved using the server’s home directory; prefer e.g. `~/paperclip-workspace` when the folder is in your home so it works regardless of home’s absolute path.
2. **Set the agent’s instructions path** to a path **relative** to that folder (e.g. `agents/head_of_delivery/HEARTBEAT.md`). In the adapter config: `instructionsFilePath: "agents/head_of_delivery/HEARTBEAT.md"`.
3. **Assign issues to that project** when they should run with that workspace. The run then uses the project workspace `cwd`, so the relative instructions path resolves.

Relative paths are resolved by the adapter against the run’s workspace `cwd` first, then `process.cwd()`. If the project workspace path is not available (missing or not visible to the server), the run falls back to a default workspace and the relative instructions path will not resolve—fix by using a path the server can see (e.g. `~/paperclip-workspace`) or by ensuring the absolute path exists where the server runs.

## 11. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
