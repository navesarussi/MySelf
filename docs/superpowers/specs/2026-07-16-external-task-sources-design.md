# External Task Sources Design — Multi-Provider Inbox (V1: Google Tasks)

**Date:** 2026-07-16  
**Status:** Approved (brainstorming)  
**Product surface:** Mobile app only (`mobile/`). Website UI is frozen.  
**Mapped SRS additions:** FR-INT-TASKS-01–07 (below)

## Summary

Build a **multi-source task inbox** so the mobile Tasks screen shows local MySelf tasks plus tasks from external platforms.

- **V1:** Google Tasks — pull open tasks from user-selected lists; complete/reopen writes back to Google.
- **Infrastructure:** provider port + registry so Monday.com, GitHub, and later sources plug in without rewriting the Tasks UI or schema.
- **Not V1:** full two-way field sync, create-from-app → Google, completed-history pull, website UI.

## Decisions

| Topic | Decision |
|---|---|
| Storage | Extend `myself.tasks` (Approach 1), not a separate table or live-only fetch |
| Identity | Generic `source` + `external_id` (not Google-only columns) |
| Projects | External tasks have `project_id = null`; filter by source / external list |
| List selection | Manual multi-select in Settings (`selected_list_ids`) |
| Pull scope V1 | Open tasks only (`pull_completed: "none"`) |
| Write-back V1 | Status only (complete / reopen) |
| Sync triggers | Manual “Sync now” + daily cron (same pattern as calendar) |
| OAuth row | Separate `integration_tokens.provider = 'google_tasks'` |
| Website | Frozen — API/`lib`/Supabase only as needed for the app |
| Future sources | New `TaskSourceProvider` implementation + registry entry |

## Architecture

```
mobile Tasks UI
    → GET /api/v1/tasks (unified rows)
    → PATCH status → local update + provider.complete/reopen when source ≠ manual

syncTaskSource(providerId) / syncAllTaskSources()
    → TaskSourceProvider.pullOpenTasks(selected_list_ids)
    → UPSERT myself.tasks by (source, external_id)
    → open local rows missing from pull → status = done
```

### Provider contract

Location: `lib/integrations/task-sources/`

```ts
type TaskSourceId = "google_tasks" | "monday" | "github"; // extend over time

type ExternalTaskDraft = {
  externalId: string;
  externalListId: string;
  title: string;
  notes: string | null;
  dueDate: string | null; // YYYY-MM-DD
  status: "open" | "done";
  meta: {
    listTitle?: string;
    deepLink?: string;
    parentExternalId?: string;
  };
};

type TaskSourceCapabilities = {
  pullOpen: true;
  writeStatus: boolean;
  listPicker: boolean;
};

interface TaskSourceProvider {
  id: TaskSourceId;
  capabilities: TaskSourceCapabilities;
  listSources(): Promise<{ id: string; title: string }[]>;
  pullOpenTasks(selectedListIds: string[]): Promise<ExternalTaskDraft[]>;
  complete(externalId: string, listId: string): Promise<void>;
  reopen(externalId: string, listId: string): Promise<void>;
}
```

Registry maps `TaskSourceId` → provider. Orchestrator is source-agnostic.

**V1 Google capabilities:** `pullOpen`, `writeStatus`, `listPicker` all true.

## Data Model

### `myself.tasks` — new / changed columns

| Column | Type | Purpose |
|---|---|---|
| `source` | `text not null default 'manual'` | `'manual'` \| `'google_tasks'` \| later ids |
| `external_id` | `text` | Provider task id; null for manual |
| `external_list_id` | `text` | Provider list/board id |
| `external_meta` | `jsonb not null default '{}'` | Display helpers (list title, link, parent) |
| `synced_at` | `timestamptz` | Last successful apply from provider |
| `project_id` | `uuid` **nullable** | Required for manual; null for external |

Constraints:

1. Unique partial index on `(source, external_id)` where `external_id is not null`.
2. Check:
   - `source = 'manual'` → `project_id is not null` and `external_id is null`
   - `source <> 'manual'` → `external_id is not null` and `project_id is null`

Index: `(source, status)` for filters; keep existing `(project_id, status)` (nulls ok).

### `myself.integration_tokens` — settings

Add `settings jsonb not null default '{}'`.

For `google_tasks`:

```json
{
  "selected_list_ids": ["LIST_ID_1"],
  "pull_completed": "none"
}
```

`pull_completed` values reserved for later phases: `"none"` | `"recent"` | `"all"`.  
V1 always behaves as `"none"` even if mis-set.

Reuse existing sync progress columns (`sync_status`, `sync_progress`, `last_sync_at`, …).

### Field mapping (Google → MySelf)

| Google Tasks | `myself.tasks` |
|---|---|
| task `id` | `external_id` |
| `tasklist` id | `external_list_id` |
| `title` | `title` |
| `notes` | `notes` |
| `due` (RFC3339) | `due_date` (date only) |
| `status` needsAction / completed | `open` / `done` |
| — | `priority = 'medium'` on import |
| — | `source = 'google_tasks'` |
| list title | `external_meta.listTitle` |
| `parent` | `external_meta.parentExternalId` (flat UI in V1) |

`in_progress` is never written by Google sync. Local priority edits on Google-sourced rows are allowed and **not** written back.

## OAuth & API

### Connect

1. Settings → Connect Google Tasks.
2. OAuth with scope `https://www.googleapis.com/auth/tasks` (read/write status).
3. Callback stores tokens under provider `google_tasks`.
4. Load task lists; user selects which to sync; save `settings.selected_list_ids`.
5. Trigger initial sync.

CSRF `state` required (reuse existing oauth-state helper).

### Endpoints (server; consumed by mobile)

| Route | Role |
|---|---|
| `…/integrations/google-tasks/connect` | Start OAuth |
| `…/integrations/google-tasks/callback` | Exchange code, save tokens |
| `…/integrations/google-tasks/disconnect` | Clear tokens; keep imported rows |
| `…/integrations/google-tasks/lists` | List available task lists |
| `…/integrations/google-tasks/settings` | PATCH selected lists / settings |
| `…/integrations/task-sources/sync` | Sync one or all providers (manual + cron) |

Exact path prefix may match existing `app/api/integrations/…` layout. Cron uses `CRON_SECRET` like calendar sync.

Login/calendar scopes stay unchanged. Tasks consent is incremental via the separate connect flow.

## Sync algorithm (V1)

Triggered by: initial connect (after lists chosen), Sync now, daily cron.

```
1. Load google_tasks token; refresh if expired
2. Read settings.selected_list_ids (if empty → no-op success, nothing imported)
3. For each list id: Tasks API list open tasks (paginate; showCompleted=false)
4. Map → ExternalTaskDraft[]; UPSERT by (source, external_id)
5. Local rows where source=google_tasks AND status=open AND external_id not in fetched set
   → set status=done, synced_at=now
   (missing from open pull ≈ completed on Google; rare hard-deletes accepted as done)
6. setSyncCompleted / touch last_sync_at only on full success
```

Do not delete local rows on “missing from pull” in V1 (preserves Done filter history).

## Status write-back

When mobile marks a non-manual task done / open:

1. Optimistic local status update.
2. Call `provider.complete` or `provider.reopen` with `external_id` + `external_list_id`.
3. On provider failure: revert local status; Hebrew toast error (`FR-TOAST-01`).
4. On success: `synced_at = now`.

Title / due / notes editors for `source ≠ manual` are **read-only in V1** (prevents silent drift). Delete of a Google-sourced task in V1 = complete on Google then local `done` (same as checkbox), not a Google API delete.

## Mobile UI

### Tasks tab

- Single list: manual + external.
- Small source badge (e.g. Google); optional list title from `external_meta`.
- Filters: existing project (manual only) + status/priority; add **source** filter and **external list** filter when any external rows exist.
- Quick-done checkbox: works for Google rows via write-back path.
- Create form: always creates `source=manual` with required `project_id`.

### Settings

- Google Tasks: connect / disconnect, multi-select lists, Sync now, last sync + progress (mirror calendar UX patterns already in the app).
- Copy clarifies: open tasks only; complete syncs back to Google.

### Out of surface

- No Next.js page/component changes for this feature.

## Error handling

| Scenario | Behavior |
|---|---|
| OAuth denied | Toast: connection cancelled |
| Token refresh fails | Settings: reconnect required; sync skipped |
| No lists selected | Sync succeeds with 0 imports |
| Google 429 | One retry; then fail sync; `last_sync_at` unchanged |
| Complete API fails | Revert optimistic status; toast |
| Invalid cron secret | 401 |
| Provider not connected | Sync that provider skipped |

## Security

- Tokens server-side only.
- Cron protected by `CRON_SECRET`.
- OAuth state for CSRF.
- Tasks scope is write-capable for status only; no broader Google scopes added to login.

## File structure (target)

```
lib/integrations/task-sources/
  types.ts
  registry.ts
  orchestrator.ts
  google-tasks/
    client.ts
    map.ts
    provider.ts
    sync.ts          # thin wrapper if needed
app/api/integrations/google-tasks/…
app/api/integrations/task-sources/sync/route.ts
supabase/migrations/00xx_external_tasks.sql
lib/__tests__/
  google-tasks-map.test.ts
  task-source-merge.test.ts
mobile/app/(tabs)/tasks.tsx      # unified filters / badge
mobile/app/settings.tsx          # connect + lists + sync
mobile/src/components/task-card.tsx
```

Keep files near the ~200-line guideline; split rather than grow god-files.

## Testing

### Unit

- Google → `ExternalTaskDraft` mapping (due, status, parent meta).
- Merge/UPSERT rules and “missing open → done”.
- Write-back failure does not leave durable wrong status (pure function / mocked provider).

### Manual (mobile)

- [ ] Connect → select lists → open Google tasks appear
- [ ] Unselected lists do not import
- [ ] Complete in app → completed in Google Tasks
- [ ] Reopen in app → needsAction in Google
- [ ] Complete in Google → next sync marks local done
- [ ] Source badge + filters
- [ ] Manual create still requires project
- [ ] Disconnect clears tokens; rows remain
- [ ] Daily cron sync with secret
- [ ] Website pages untouched

## SRS Requirements (to add)

### FR-INT-TASKS-01
Tasks support a `source` of `manual` or an external provider id. The mobile Tasks screen shows a unified list of all sources.

### FR-INT-TASKS-02
External task providers implement a shared port (list sources, pull open tasks, complete, reopen) and register in a central registry.

### FR-INT-TASKS-03
User connects Google Tasks via OAuth (`tasks` scope), selects which task lists to sync, and may sync manually or via daily cron.

### FR-INT-TASKS-04
V1 pull imports only open Google tasks from selected lists into `myself.tasks` with `project_id` null and generic external identity columns.

### FR-INT-TASKS-05
Completing or reopening a Google-sourced task in the app updates Google Tasks; failure reverts the local status and shows an error toast.

### FR-INT-TASKS-06
External-sourced task title/due/notes are read-only in V1. Priority may be edited locally without write-back.

### FR-INT-TASKS-07
Mobile Settings exposes Google Tasks connection, list picker, sync status, and Sync now. Website UI is out of scope.

## Roadmap (explicitly not V1)

| Phase | Scope |
|---|---|
| V1.1 | `pull_completed: "recent"` (time-bounded done import) |
| V1.2 | Optional create-from-app → Google list |
| V2 | Monday.com provider |
| V2.1 | GitHub issues/PRs as tasks |
| Later | `pull_completed: "all"`; unify Google Calendar + Tasks tokens |

## Out of scope (V1)

- Website UI changes
- Full two-way field sync / Google API delete
- Mapping Google lists ↔ MySelf projects
- Nested subtask UI (parent stored in meta only)
- Implementing Monday or GitHub providers
- Unifying `google_calendar` and `google_tasks` token rows

## CODE QUALITY notes

Log as pending (do not do in V1):

- `[PENDING REFACTOR]: Unify Google OAuth tokens (calendar + tasks) into one Google credential row with incremental scopes.`
- `[PENDING REFACTOR]: When a third task source ships, consider `integration_settings` table if `settings` jsonb on tokens becomes awkward.`

## Estimated effort (V1)

| Piece | Days |
|---|---|
| Migration + types + API task shape | 0.5 |
| Provider port + Google client/map/sync | 1.5 |
| OAuth connect/callback/settings/lists | 1 |
| Status write-back path | 0.5 |
| Mobile Tasks UI (badge, filters, read-only) | 1 |
| Mobile Settings + cron wire-up | 0.5 |
| Tests + polish | 1 |
| **Total** | **~6 days** |
