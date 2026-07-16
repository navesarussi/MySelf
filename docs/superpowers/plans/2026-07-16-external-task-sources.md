# External Task Sources (V1: Google Tasks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile Tasks shows a unified inbox of local tasks plus Google Tasks (selected lists), with status complete/reopen writing back to Google, on a multi-provider port ready for Monday/GitHub later.

**Architecture:** Extend `myself.tasks` with generic `source` / `external_*` columns; implement `TaskSourceProvider` + registry + orchestrator under `lib/integrations/task-sources/`; Google Tasks is the first provider (OAuth row `google_tasks`). Mobile UI only — no website page changes. Sync via manual button + daily Vercel cron. No `googleapis` npm package — `fetch` against Google REST APIs (same as calendar).

**Tech Stack:** Next.js App Router API (`app/api/v1` + integrations routes), Supabase `myself` schema, Expo mobile app, `node:test` + `tsx`.

**Design spec:** `docs/superpowers/specs/2026-07-16-external-task-sources-design.md`

## Global Constraints

- Product surface: **mobile only** — do not edit Next.js website UI (`app/**/page.tsx`, site `components/**`). See `CLAUDE.md` / `mobile/SCOPE.md`.
- Shared backend allowed: `app/api/**`, `lib/**`, `supabase/**`.
- Docs in English; user-facing mobile copy via i18n (Hebrew + English keys).
- Max ~200 lines per file; split rather than grow.
- V1 pull: open tasks only; write-back: status only; external `project_id` is null.
- Bump `mobile/package.json` version (and native fields if cutting a store build) when shipping per project version rules.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0013_external_tasks.sql` | Schema: external columns, nullable `project_id`, token `settings` |
| `lib/types.ts` | `TaskSource`, extended `Task`, token `settings` |
| `lib/integrations/task-sources/types.ts` | Provider port + draft types |
| `lib/integrations/task-sources/merge.ts` | Pure UPSERT payload + missing-open → done |
| `lib/integrations/task-sources/registry.ts` | Provider registry |
| `lib/integrations/task-sources/orchestrator.ts` | `syncTaskSource` / `syncAllTaskSources` |
| `lib/integrations/task-sources/google-tasks/types.ts` | Google API shapes |
| `lib/integrations/task-sources/google-tasks/map.ts` | Pure Google → `ExternalTaskDraft` |
| `lib/integrations/task-sources/google-tasks/client.ts` | OAuth URL, lists, tasks, complete/reopen |
| `lib/integrations/task-sources/google-tasks/provider.ts` | `TaskSourceProvider` impl |
| `lib/integrations/google-config.ts` | `GOOGLE_TASKS_SCOPE`, `GOOGLE_TASKS_PROVIDER` |
| `lib/integrations/tokens.ts` | `settings` read/write helpers |
| `app/api/integrations/google-tasks/connect/route.ts` | Start OAuth |
| `app/api/integrations/google-tasks/callback/route.ts` | Exchange code, store tokens |
| `app/api/integrations/google-tasks/disconnect/route.ts` | Clear tokens |
| `app/api/v1/integrations/google-tasks/lists/route.ts` | List task lists (Bearer) |
| `app/api/v1/integrations/google-tasks/settings/route.ts` | GET/PATCH settings |
| `app/api/v1/integrations/google-tasks/status/route.ts` | Connection + sync status |
| `app/api/v1/integrations/task-sources/sync/route.ts` | Manual sync (Bearer) |
| `app/api/integrations/task-sources/sync/route.ts` | Cron GET (CRON_SECRET) |
| `app/api/v1/tasks/route.ts` | Filters: `source`, `external_list` |
| `app/api/v1/tasks/[id]/route.ts` | External read-only fields; status write-back |
| `vercel.json` | Add daily cron for task-sources sync |
| `docs/SSOT/SRS.md` | FR-INT-TASKS-01–07 |
| `package.json` | Register new unit test files in `test` script |
| `mobile/src/api/resources.ts` | Tasks filters + Google Tasks API helpers |
| `mobile/src/components/task-card.tsx` | Source badge |
| `mobile/app/(tabs)/tasks.tsx` | Filters + read-only edit for external |
| `mobile/app/settings.tsx` | Connect, list picker, sync |
| `mobile/src/i18n` / `lib/i18n/messages.ts` | Copy keys |
| `lib/__tests__/google-tasks-map.test.ts` | Mapping tests |
| `lib/__tests__/task-source-merge.test.ts` | Merge / done-missing tests |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0013_external_tasks.sql`

**Interfaces:**
- Produces: columns on `myself.tasks` and `settings` on `myself.integration_tokens` as in the spec

- [ ] **Step 1: Write migration**

```sql
-- External task sources (multi-provider inbox)

alter table myself.tasks
  alter column project_id drop not null;

alter table myself.tasks
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists external_list_id text,
  add column if not exists external_meta jsonb not null default '{}'::jsonb,
  add column if not exists synced_at timestamptz;

alter table myself.tasks
  drop constraint if exists tasks_source_identity_check;

alter table myself.tasks
  add constraint tasks_source_identity_check check (
    (source = 'manual' and project_id is not null and external_id is null)
    or (source <> 'manual' and external_id is not null and project_id is null)
  );

create unique index if not exists tasks_source_external_id_uidx
  on myself.tasks (source, external_id)
  where external_id is not null;

create index if not exists tasks_source_status_idx
  on myself.tasks (source, status);

alter table myself.integration_tokens
  add column if not exists settings jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Apply migration**

Run: `yarn db:apply` (or apply `0013_external_tasks.sql` in the Supabase SQL editor).

Expected: migration succeeds; existing manual tasks still have `project_id` set.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_external_tasks.sql
git commit -m "feat(db): add external task source columns and token settings"
```

---

### Task 2: Shared types

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/integrations/tokens.ts` (settings helpers — stubs ok until Task 6 wires OAuth)
- Modify: `lib/integrations/google-config.ts`

**Interfaces:**
- Produces:
  - `TaskSource = "manual" | "google_tasks"` (extend later)
  - `Task` with `source`, `external_id`, `external_list_id`, `external_meta`, `synced_at`; `project_id: string | null`
  - `GOOGLE_TASKS_PROVIDER = "google_tasks"`
  - `GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks"`
  - `IntegrationToken.settings: Record<string, unknown>`
  - `getTokenSettings` / `updateTokenSettings`

- [ ] **Step 1: Extend `lib/types.ts`**

Add/replace Task-related types:

```ts
export type TaskSource = "manual" | "google_tasks";

export type TaskExternalMeta = {
  listTitle?: string;
  deepLink?: string;
  parentExternalId?: string;
};

export type Task = {
  id: string;
  title: string;
  project_id: string | null;
  project_name?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  notes: string | null;
  source: TaskSource;
  external_id: string | null;
  external_list_id: string | null;
  external_meta: TaskExternalMeta;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};
```

Extend `IntegrationToken` with:

```ts
settings: Record<string, unknown>;
```

- [ ] **Step 2: Update `lib/integrations/google-config.ts`**

```ts
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const GOOGLE_TASKS_PROVIDER = "google_tasks";
```

Keep existing calendar constants unchanged.

- [ ] **Step 3: Add settings helpers in `lib/integrations/tokens.ts`**

```ts
export async function getTokenSettings<T extends Record<string, unknown>>(
  provider: string
): Promise<T> {
  const token = await getIntegrationToken(provider);
  return ((token?.settings ?? {}) as T);
}

export async function updateTokenSettings(
  provider: string,
  settings: Record<string, unknown>
) {
  const supabase = getSupabase();
  await supabase.from("integration_tokens").update({ settings }).eq("provider", provider);
}
```

Ensure `getIntegrationToken` / `saveIntegrationToken` select and preserve `settings` (on upsert, merge existing settings if the caller omits them — do not wipe to `{}` accidentally).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/integrations/google-config.ts lib/integrations/tokens.ts
git commit -m "feat: add TaskSource types and Google Tasks provider constants"
```

---

### Task 3: Provider port + merge (TDD)

**Files:**
- Create: `lib/integrations/task-sources/types.ts`
- Create: `lib/integrations/task-sources/merge.ts`
- Create: `lib/__tests__/task-source-merge.test.ts`
- Modify: `package.json` (`test` script — add this file; keep adding in later tasks)

**Interfaces:**
- Produces:
  - `TaskSourceId`, `ExternalTaskDraft`, `TaskSourceCapabilities`, `TaskSourceProvider`
  - `buildExternalTaskUpsert(draft, nowIso) → row fields for upsert`
  - `idsToMarkDone(localOpenExternalIds: string[], fetchedIds: Set<string>) → string[]`

- [ ] **Step 1: Write failing tests**

`lib/__tests__/task-source-merge.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExternalTaskUpsert, idsToMarkDone } from "../integrations/task-sources/merge";

describe("buildExternalTaskUpsert", () => {
  it("maps draft to task row fields", () => {
    const row = buildExternalTaskUpsert(
      {
        externalId: "t1",
        externalListId: "l1",
        title: "Buy milk",
        notes: "2%",
        dueDate: "2026-07-20",
        status: "open",
        meta: { listTitle: "Personal" },
      },
      "google_tasks",
      "2026-07-16T00:00:00.000Z"
    );
    assert.equal(row.source, "google_tasks");
    assert.equal(row.external_id, "t1");
    assert.equal(row.project_id, null);
    assert.equal(row.priority, "medium");
    assert.equal(row.status, "open");
    assert.equal(row.external_meta.listTitle, "Personal");
    assert.equal(row.synced_at, "2026-07-16T00:00:00.000Z");
  });
});

describe("idsToMarkDone", () => {
  it("marks local open ids missing from fetch as done", () => {
    assert.deepEqual(
      idsToMarkDone(["a", "b", "c"], new Set(["a", "c"])),
      ["b"]
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --import tsx --test lib/__tests__/task-source-merge.test.ts`

Expected: FAIL (module not found / export missing).

- [ ] **Step 3: Implement types + merge**

`lib/integrations/task-sources/types.ts` — exact shapes from the design spec (`TaskSourceId`, `ExternalTaskDraft`, `TaskSourceCapabilities`, `TaskSourceProvider`).

`lib/integrations/task-sources/merge.ts`:

```ts
import type { TaskSource } from "@/lib/types";
import type { ExternalTaskDraft } from "./types";

export function buildExternalTaskUpsert(
  draft: ExternalTaskDraft,
  source: TaskSource,
  syncedAt: string
) {
  return {
    source,
    external_id: draft.externalId,
    external_list_id: draft.externalListId,
    project_id: null,
    title: draft.title,
    notes: draft.notes,
    due_date: draft.dueDate,
    status: draft.status === "done" ? "done" : "open",
    priority: "medium" as const,
    external_meta: draft.meta,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export function idsToMarkDone(localOpenExternalIds: string[], fetchedIds: Set<string>) {
  return localOpenExternalIds.filter((id) => !fetchedIds.has(id));
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --import tsx --test lib/__tests__/task-source-merge.test.ts`

Expected: PASS.

- [ ] **Step 5: Register in `package.json` test script and commit**

Append `lib/__tests__/task-source-merge.test.ts` to the `test` script array.

```bash
git add lib/integrations/task-sources/types.ts lib/integrations/task-sources/merge.ts lib/__tests__/task-source-merge.test.ts package.json
git commit -m "feat: add task-source provider types and merge helpers"
```

---

### Task 4: Google Tasks map (TDD)

**Files:**
- Create: `lib/integrations/task-sources/google-tasks/types.ts`
- Create: `lib/integrations/task-sources/google-tasks/map.ts`
- Create: `lib/__tests__/google-tasks-map.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `mapGoogleTask(task, listId, listTitle) → ExternalTaskDraft | null`
- Skips completed when mapping for open pull; maps `due` RFC3339 → `YYYY-MM-DD`; maps `parent` → `meta.parentExternalId`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapGoogleTask } from "../integrations/task-sources/google-tasks/map";

const openTask = {
  id: "gt1",
  title: "Ship it",
  notes: "asap",
  status: "needsAction",
  due: "2026-08-01T00:00:00.000Z",
  parent: "parent1",
};

describe("mapGoogleTask", () => {
  it("maps open task", () => {
    const d = mapGoogleTask(openTask, "listA", "Work");
    assert.equal(d?.externalId, "gt1");
    assert.equal(d?.externalListId, "listA");
    assert.equal(d?.dueDate, "2026-08-01");
    assert.equal(d?.status, "open");
    assert.equal(d?.meta.listTitle, "Work");
    assert.equal(d?.meta.parentExternalId, "parent1");
  });

  it("returns null for completed", () => {
    assert.equal(mapGoogleTask({ ...openTask, status: "completed" }, "listA", "Work"), null);
  });

  it("returns null without id", () => {
    assert.equal(mapGoogleTask({ ...openTask, id: undefined }, "listA", "Work"), null);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --import tsx --test lib/__tests__/google-tasks-map.test.ts`

- [ ] **Step 3: Implement map + Google types**

Define `GoogleTask` / list response types in `types.ts`. Implement `mapGoogleTask` in `map.ts` (title fallback `"Untitled"` if empty).

- [ ] **Step 4: Run — expect PASS; register in package.json; commit**

```bash
git add lib/integrations/task-sources/google-tasks/ lib/__tests__/google-tasks-map.test.ts package.json
git commit -m "feat: map Google Tasks API payloads to ExternalTaskDraft"
```

---

### Task 5: Google Tasks client + provider + orchestrator

**Files:**
- Create: `lib/integrations/task-sources/google-tasks/client.ts`
- Create: `lib/integrations/task-sources/google-tasks/provider.ts`
- Create: `lib/integrations/task-sources/registry.ts`
- Create: `lib/integrations/task-sources/orchestrator.ts`

**Interfaces:**
- Consumes: merge helpers, map, tokens, `GOOGLE_TASKS_PROVIDER`
- Produces:
  - `googleTasksAuthUrl(state: string): string`
  - `fetchTaskLists(accessToken)`, `fetchOpenTasks(accessToken, listId)`, `completeGoogleTask`, `reopenGoogleTask`
  - `createGoogleTasksProvider(): TaskSourceProvider`
  - `getTaskSourceProvider(id)`, `listTaskSourceProviders()`
  - `syncTaskSource(providerId): Promise<{ imported: number; markedDone: number }>`
  - `syncAllTaskSources(): Promise<…>`

- [ ] **Step 1: Implement `client.ts`**

Mirror calendar client patterns (`exchangeCode` / `refreshAccessToken` can be imported from `lib/integrations/google-calendar/client.ts` to avoid duplication).

```ts
// Auth URL uses GOOGLE_TASKS_SCOPE and redirect:
// process.env.GOOGLE_TASKS_REDIRECT_URI
//   ?? derived `${origin}/api/integrations/google-tasks/callback`
// Prefer explicit GOOGLE_TASKS_REDIRECT_URI in .env (must be allowed in Google Cloud Console).

export function googleTasksAuthUrl(state: string) { /* … */ }

export async function fetchTaskLists(accessToken: string) { /* GET tasks/v1/users/@me/lists paginate */ }

export async function fetchOpenTasks(accessToken: string, listId: string) {
  // GET tasks/v1/lists/{listId}/tasks?showCompleted=false&showHidden=false paginate
  // one retry on 429 after 2s (same as calendar)
}

export async function completeGoogleTask(accessToken: string, listId: string, taskId: string) {
  // PATCH .../tasks/{taskId} body { status: "completed" }
}

export async function reopenGoogleTask(accessToken: string, listId: string, taskId: string) {
  // PATCH .../tasks/{taskId} body { status: "needsAction" }
}
```

Also: `getValidGoogleTasksAccessToken()` — load token row, refresh if `expires_at` past, save new access token (preserve refresh + settings).

- [ ] **Step 2: Implement `provider.ts`**

```ts
export function createGoogleTasksProvider(): TaskSourceProvider {
  return {
    id: "google_tasks",
    capabilities: { pullOpen: true, writeStatus: true, listPicker: true },
    async listSources() { /* fetchTaskLists → { id, title } */ },
    async pullOpenTasks(selectedListIds) {
      // for each list: fetchOpenTasks + mapGoogleTask; skip nulls
      // resolve list titles from listSources or a parallel lists fetch
    },
    async complete(externalId, listId) { /* completeGoogleTask */ },
    async reopen(externalId, listId) { /* reopenGoogleTask */ },
  };
}
```

- [ ] **Step 3: Registry + orchestrator**

`registry.ts`: map with `google_tasks` → `createGoogleTasksProvider()`.

`orchestrator.ts` outline:

```ts
export async function syncTaskSource(providerId: TaskSourceId) {
  const provider = getTaskSourceProvider(providerId);
  if (!provider) throw new Error("unknown_provider");
  const started = await tryStartSync(providerId);
  if (!started) return { imported: 0, markedDone: 0, alreadyRunning: true as const };

  try {
    const settings = await getTokenSettings<{ selected_list_ids?: string[] }>(providerId);
    const selected = settings.selected_list_ids ?? [];
    const drafts = selected.length ? await provider.pullOpenTasks(selected) : [];
    const now = new Date().toISOString();
    const fetchedIds = new Set(drafts.map((d) => d.externalId));

    // UPSERT each buildExternalTaskUpsert(draft, providerId, now)
    // onConflict: source,external_id (Supabase upsert needs matching unique index)

    // Load local open rows for this source → idsToMarkDone → update status=done

    await setSyncCompleted(providerId);
    return { imported: drafts.length, markedDone: /* count */ };
  } catch (e) {
    await setSyncFailed(providerId);
    throw e;
  }
}
```

Use Supabase `upsert` with `onConflict: "source,external_id"` only if PostgREST supports the partial unique index — if not, select-by-external_id then insert/update in a loop (acceptable for personal-scale lists). Prefer the loop if upsert is flaky with partial indexes.

- [ ] **Step 4: Smoke-typecheck**

Run: `yarn tsc --noEmit` (or project’s usual typecheck). Fix errors in new files only.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/task-sources/
git commit -m "feat: Google Tasks client, provider, and sync orchestrator"
```

---

### Task 6: OAuth connect / callback / disconnect

**Files:**
- Create: `app/api/integrations/google-tasks/connect/route.ts`
- Create: `app/api/integrations/google-tasks/callback/route.ts`
- Create: `app/api/integrations/google-tasks/disconnect/route.ts`
- Modify: `.env.example` (add `GOOGLE_TASKS_REDIRECT_URI`)
- Ops note: register the redirect URI in Google Cloud Console for the same OAuth client

**Interfaces:**
- Consumes: `googleTasksAuthUrl`, `setOAuthState`, `exchangeCode`, `saveIntegrationToken`
- Produces: working connect → callback → `google_tasks` token row

- [ ] **Step 1: Connect route**

```ts
// GET: create random state, setOAuthState(state, nextPath)
// Support query: next (path starting with /), app_redirect (allowed deep link — store in cookie or encode in state)
// Redirect to googleTasksAuthUrl(state)
```

Extend oauth helpers if needed so mobile can pass `app_redirect` (reuse `isAllowedAppRedirect` from `lib/integrations/mobile-redirect.ts`). Store `app_redirect` in an httpOnly cookie (new cookie name `google_tasks_oauth_app_redirect`) for the callback.

- [ ] **Step 2: Callback route**

```ts
// Validate state; exchangeCode; require refresh_token (or merge with existing google_tasks row)
// saveIntegrationToken({ provider: GOOGLE_TASKS_PROVIDER, …, settings: existing?.settings ?? { selected_list_ids: [], pull_completed: "none" } })
// Redirect: app_redirect if set, else next path, else "/"
// Do NOT start sync until lists are selected (Settings will PATCH lists then sync)
```

- [ ] **Step 3: Disconnect route**

DELETE token row for `google_tasks`. Keep imported task rows. Auth: session cookie **or** for v1 mobile prefer Bearer via a v1 wrapper — implement disconnect as `POST`/`DELETE` under `app/api/v1/integrations/google-tasks/disconnect/route.ts` with `isApiAuthorized`, and keep cookie-based disconnect optional. **Minimum:** Bearer-authenticated v1 disconnect used by the app.

- [ ] **Step 4: Document env**

`.env.example`:

```
GOOGLE_TASKS_REDIRECT_URI=http://localhost:3000/api/integrations/google-tasks/callback
```

- [ ] **Step 5: Commit**

```bash
git add app/api/integrations/google-tasks/ app/api/v1/integrations/google-tasks/ .env.example lib/integrations/oauth-state.ts
git commit -m "feat: Google Tasks OAuth connect, callback, disconnect"
```

---

### Task 7: Mobile-facing API — lists, settings, status, sync + cron

**Files:**
- Create: `app/api/v1/integrations/google-tasks/lists/route.ts`
- Create: `app/api/v1/integrations/google-tasks/settings/route.ts`
- Create: `app/api/v1/integrations/google-tasks/status/route.ts`
- Create: `app/api/v1/integrations/task-sources/sync/route.ts`
- Create: `app/api/integrations/task-sources/sync/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- `GET lists` → `{ id, title }[]`
- `GET/PATCH settings` → `{ selected_list_ids, pull_completed }`
- `GET status` → `{ connected, syncStatus, lastSyncAt, taskCount, selected_list_ids }`
- `POST /api/v1/integrations/task-sources/sync` body `{ provider?: "google_tasks" }` → sync result
- Cron `GET /api/integrations/task-sources/sync` with `Authorization: Bearer CRON_SECRET` — sync all connected task sources; skip per-provider if synced within 24h (same day rule as calendar)

- [ ] **Step 1: Implement the four v1 routes** with `isApiAuthorized`.

PATCH settings validation: `selected_list_ids` must be `string[]`. After successful PATCH, optionally kick off `syncTaskSource("google_tasks")` inline (return imported counts) so choosing lists immediately populates tasks.

- [ ] **Step 2: Cron route** — copy auth/skip pattern from `app/api/integrations/google/sync/route.ts`, call `syncAllTaskSources()` (or only providers with a token row).

- [ ] **Step 3: Update `vercel.json`**

```json
{
  "framework": "nextjs",
  "regions": ["syd1"],
  "crons": [
    { "path": "/api/integrations/google/sync", "schedule": "0 6 * * *" },
    { "path": "/api/integrations/task-sources/sync", "schedule": "15 6 * * *" }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/integrations/ app/api/integrations/task-sources/ vercel.json
git commit -m "feat: task-source sync API, Google Tasks settings, daily cron"
```

---

### Task 8: Tasks CRUD API — filters + write-back

**Files:**
- Modify: `app/api/v1/tasks/route.ts`
- Modify: `app/api/v1/tasks/[id]/route.ts`
- Create (optional thin helper): `lib/integrations/task-sources/writeback.ts`  
  `applyExternalStatusChange(task, nextStatus) → Promise<void>`

**Interfaces:**
- Consumes: registry `complete` / `reopen`
- GET supports `source`, `external_list` query params
- POST always inserts `source: "manual"` (require `project_id`)
- PATCH: if `source !== "manual"`:
  - reject changes to `title`, `due_date`, `notes`, `project_id` with `400` + `external_readonly`
  - allow `priority` and `status`
  - on `status` → `done` call `complete`; on `open` (from done) call `reopen`; `in_progress` on external → treat as `open` locally without Google call (or reject `in_progress` for external with 400 — **prefer reject**)
- DELETE on external: call `complete` then set local `done` (do not hard-delete), return `{ ok: true, completed: true }`; manual rows hard-delete as today

- [ ] **Step 1: Update GET filters**

```ts
const source = sp.get("source");
const externalList = sp.get("external_list");
if (source) q = q.eq("source", source);
if (externalList) q = q.eq("external_list_id", externalList);
```

When selecting, left-join projects still works with null `project_id`.

- [ ] **Step 2: Implement PATCH/DELETE write-back**

Load existing row first. If write-back fails, return 502 `{ error: "external_write_failed" }` and **do not** persist status (or persist then compensate — prefer fail before update: call Google first for status, then update DB). Spec allows optimistic UI on client; server should be authoritative: **Google first, then DB** for external status to avoid drift.

- [ ] **Step 3: Manual test with curl** (Bearer token) against local server — document commands in commit message body if useful.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/tasks/ lib/integrations/task-sources/writeback.ts
git commit -m "feat: unified tasks API filters and Google status write-back"
```

---

### Task 9: Mobile API client + Tasks UI

**Files:**
- Modify: `mobile/src/api/resources.ts`
- Modify: `mobile/src/components/task-card.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `lib/i18n/messages.ts` (and mobile i18n bridge if separate)

**Interfaces:**
- `api.tasks` accepts `source?`, `external_list?`
- New: `googleTasksStatus`, `googleTasksLists`, `patchGoogleTasksSettings`, `disconnectGoogleTasks`, `syncTaskSources`
- Task card shows source badge when `task.source !== "manual"`
- Edit modal: hide title/due/notes inputs for external (or disable); show list title; status/priority only
- Filters: source chips (All / Manual / Google); when Google selected, optional list chips from distinct `external_list_id` / meta titles in loaded data

- [ ] **Step 1: Extend `resources.ts`**

```ts
tasks: (c, params?: { project?: string; status?: string; priority?: string; source?: string; external_list?: string }) => { /* … */ },

googleTasksStatus: (c) => apiFetch(c, "/integrations/google-tasks/status"),
googleTasksLists: (c) => apiFetch<{ id: string; title: string }[]>(c, "/integrations/google-tasks/lists"),
patchGoogleTasksSettings: (c, body: { selected_list_ids: string[] }) =>
  apiFetch(c, "/integrations/google-tasks/settings", { method: "PATCH", body }),
disconnectGoogleTasks: (c) =>
  apiFetch(c, "/integrations/google-tasks/disconnect", { method: "POST", body: {} }),
syncTaskSources: (c, provider?: string) =>
  apiFetch(c, "/integrations/task-sources/sync", {
    method: "POST",
    body: provider ? { provider } : {},
  }),
```

- [ ] **Step 2: Task card badge**

Small `Badge` with label from i18n `tasks.source.google_tasks` when `task.source === "google_tasks"`. Prefer list title subtitle from `task.external_meta?.listTitle` when present.

- [ ] **Step 3: Tasks screen filters + read-only edit**

- Add source filter state.
- For external tasks opening the form: only status + priority editable; save via `updateTask`.
- Quick-done checkbox already calls status update — ensure it uses `done`/`open` (not `in_progress` cycle) for external tasks: when toggling done on Google tasks, set `done` or `open` only.

- [ ] **Step 4: i18n keys** (he + en) for source labels, readonly hint, filter labels.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/resources.ts mobile/src/components/task-card.tsx mobile/app/(tabs)/tasks.tsx lib/i18n/messages.ts
git commit -m "feat(mobile): unified tasks inbox with Google source badge and filters"
```

---

### Task 10: Mobile Settings — connect, lists, sync

**Files:**
- Modify: `mobile/app/settings.tsx`
- Modify: `lib/i18n/messages.ts`

**Interfaces:**
- Connect opens `WebBrowser.openAuthSessionAsync` to  
  `${API_URL}/api/integrations/google-tasks/connect?app_redirect=${encodeURIComponent(Linking.createURL("/settings"))}`
- After return, refresh status; if connected and no lists selected, fetch lists and show multi-select chips; Save calls `patchGoogleTasksSettings`
- Sync now → `syncTaskSources(c, "google_tasks")`
- Disconnect → confirm → `disconnectGoogleTasks`

- [ ] **Step 1: Implement Settings section “Google Tasks”** below existing calendar/sync UI (do not remove calendar controls).

- [ ] **Step 2: Manual device check**

Checklist from spec:
- Connect → select lists → open tasks appear
- Complete in app → completed in Google
- Complete in Google → next sync marks local done
- Disconnect keeps rows

- [ ] **Step 3: Bump mobile version** (patch) in `mobile/package.json` / `app.json` if preparing a TestFlight build; otherwise leave a note for the release commit.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/settings.tsx lib/i18n/messages.ts mobile/package.json mobile/app.json
git commit -m "feat(mobile): Google Tasks connect, list picker, and sync in settings"
```

---

### Task 11: SRS + final verification

**Files:**
- Modify: `docs/SSOT/SRS.md`

- [ ] **Step 1: Append FR-INT-TASKS-01–07** exactly as written in the design spec section “SRS Requirements”.

- [ ] **Step 2: Run full unit suite**

Run: `yarn test`

Expected: all existing + new tests PASS.

- [ ] **Step 3: Confirm website UI untouched**

Run: `git diff main -- app/tasks app/settings components | head` (or vs branch base) — should show no website page edits for this feature (API-only under `app/api` is fine).

- [ ] **Step 4: Commit**

```bash
git add docs/SSOT/SRS.md
git commit -m "docs(srs): add FR-INT-TASKS-01–07 for external task sources"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Extend `tasks` + generic external columns | T1 |
| Provider port + registry | T3, T5 |
| Google map/client/provider | T4, T5 |
| OAuth `google_tasks` + settings lists | T2, T6, T7 |
| Pull open only + missing → done | T3, T5 |
| Status write-back | T8 |
| Unified mobile list + badge + filters | T9 |
| Settings connect/picker/sync | T10 |
| Daily cron | T7 |
| SRS FR-INT-TASKS-01–07 | T11 |
| Website frozen | Global constraint + T11 check |
| No full two-way / no Monday-GitHub impl | Out of scope (port only) |

No TBD placeholders. Types aligned: `ExternalTaskDraft`, `TaskSourceId` `google_tasks`, settings `selected_list_ids`.
