# Monday.com Task Source Design — Multi-Account Assigned Inbox

**Date:** 2026-07-19  
**Status:** Approved — implementing  
**Product surface:** Expo app (`mobile/` + web SPA). Legacy website out of scope.  
**Mapped SRS additions:** FR-INT-TASKS-08–14 (below)  
**Extends:** `docs/superpowers/specs/2026-07-16-external-task-sources-design.md` (V2 Monday)

## Summary

Add **Monday.com** as an external task source, with **multiple accounts** (e.g. personal + work):

- User can **add / disconnect accounts independently**.
- Per account: choose which **boards** to sync.
- Pull only items **assigned to the connected user** that are **not Done**.
- **Complete / reopen** in MySelf writes status back to Monday (same as Google Tasks).
- Tasks land in the unified Tasks inbox with `source = 'monday'`.

## Decisions

| Topic | Decision |
|---|---|
| Auth | Monday OAuth app (not pasted personal API tokens) |
| Multi-account | Multiple `integration_tokens` rows: `provider = 'monday'` + `account_key` |
| Add account UX | Settings → «Add Monday account» → OAuth (Monday account picker) |
| Pull filter | Assigned to me (`assigned_to_me`) AND not Done |
| Board selection | Per-account multi-select (`selected_list_ids` = board ids) |
| Write-back | Status only (complete → Done label; reopen → first non-done label) |
| Task identity | `source = 'monday'`, `external_id = '{account_key}:{item_id}'` |
| List identity | `external_list_id` = board id |
| Google Tasks | Unchanged; uses `account_key = ''` |
| Website legacy | Out of scope |
| Out of scope V1 | Create item from app, subitems as separate tasks, column mapping UI, webhooks |

## User flow

1. Settings → Monday section → **Add account**.
2. OAuth on Monday; user picks Personal or Work (or any account they belong to).
3. Callback stores token + account metadata (`account_key`, name/slug).
4. App loads boards; user selects which to sync; Save.
5. Sync now / daily cron pulls assigned open items into `myself.tasks`.
6. User may add another account and repeat; may disconnect any account without affecting others.

## Architecture

```
mobile Settings
  → GET  /api/v1/integrations/monday/accounts
  → GET  /api/integrations/monday/connect?app_redirect=…
  → GET  /api/integrations/monday/callback
  → GET  /api/v1/integrations/monday/boards?account_key=
  → PATCH /api/v1/integrations/monday/settings  { account_key, selected_list_ids }
  → POST /api/v1/integrations/monday/disconnect { account_key }
  → POST /api/v1/integrations/task-sources/sync { provider: "monday" }
       → syncs ALL connected Monday accounts

Tasks UI
  → filter source=monday (optional account / board chips later if needed)
  → PATCH status → monday provider complete/reopen for that account_key
```

### Provider contract (extensions)

Keep `TaskSourceId = "monday"`. Multi-account is handled in the Monday adapter + token layer, not as separate TaskSourceIds.

```ts
// Existing port stays; Monday factory is account-scoped:
createMondayProvider(accountKey: string): TaskSourceProvider

// Orchestrator for monday:
// 1. list all tokens where provider='monday'
// 2. for each account: pullOpenTasks(selected_list_ids) → upsert
// 3. mark-done cleanup scoped per account_key prefix OR per external_meta.account_key
```

Capabilities: `pullOpen`, `writeStatus`, `listPicker` all true.

### Monday GraphQL (conceptual)

- List boards: `boards { id name }` (boards user can access).
- Pull items per board with people filter `assigned_to_me`, then drop items whose status column is Done (`is_done` / done label).
- Complete: mutate status column to a done label.
- Reopen: mutate status column to a non-done label (prefer previous label stored in `external_meta` when available).

Due date: map from date/timeline column if present; else null.  
Notes: item updates / long text — V1 may use empty or first update snippet; title = item `name`.  
Deep link: `https://{slug}.monday.com/boards/{boardId}/pulses/{itemId}` when slug known.

## Data model

### Migration: multi-account tokens

`myself.integration_tokens` today: `provider text primary key`.

Change to:

| Column | Type | Notes |
|---|---|---|
| `provider` | `text not null` | e.g. `google_tasks`, `monday` |
| `account_key` | `text not null default ''` | `''` for single-account providers; Monday account id |
| `access_token` | `text not null` | |
| `refresh_token` | `text` **nullable** | Monday legacy OAuth often has no refresh |
| `expires_at` | `timestamptz` **nullable** | null = non-expiring token |
| `connected_at` | `timestamptz` | |
| `last_sync_at` | `timestamptz` | |
| `sync_status` / progress cols | existing | per account row |
| `settings` | `jsonb` | per account |

Primary key: `(provider, account_key)`.

Migrate existing rows: `account_key = ''`.

Monday `settings` shape:

```json
{
  "selected_list_ids": ["BOARD_ID_1"],
  "account_name": "Acme Work",
  "account_slug": "acme",
  "pull_completed": "none"
}
```

### `myself.tasks`

No new columns required. Use:

- `source = 'monday'`
- `external_id = '{account_key}:{item_id}'`
- `external_list_id = board_id`
- `external_meta`:

```json
{
  "account_key": "12345",
  "account_name": "Acme Work",
  "listTitle": "Sprint Board",
  "deepLink": "https://acme.monday.com/boards/.../pulses/...",
  "statusColumnId": "status",
  "statusLabel": "Working on it"
}
```

## OAuth / env

| Env | Purpose |
|---|---|
| `MONDAY_CLIENT_ID` | Monday app client id |
| `MONDAY_CLIENT_SECRET` | Monday app secret |
| `MONDAY_REDIRECT_URI` | `https://myselfapp.xyz/api/integrations/monday/callback` (prod) |

Scopes (minimum): `me:read`, `account:read`, `boards:read`, `boards:write`, `workspaces:read`.

Monday Developer Center: register redirect URI (prod + localhost for dev).

**Prerequisite (manual, not code):** Create Monday app in [Monday Developer Center](https://developer.monday.com/), configure OAuth scopes + redirect URLs, paste credentials into Vercel env.

## API surface

| Method | Path | Role |
|---|---|---|
| GET | `/api/integrations/monday/connect` | Start OAuth (`app_redirect`, optional `state`) |
| GET | `/api/integrations/monday/callback` | Exchange code, upsert token row, redirect app |
| GET | `/api/v1/integrations/monday/accounts` | List connected accounts + sync status + selected boards |
| GET | `/api/v1/integrations/monday/boards?account_key=` | Boards for picker |
| PATCH | `/api/v1/integrations/monday/settings` | `{ account_key, selected_list_ids }` |
| POST | `/api/v1/integrations/monday/disconnect` | `{ account_key }` — delete token + leave tasks (or mark done — see below) |
| POST | `/api/v1/integrations/task-sources/sync` | `{ provider: "monday" }` syncs all Monday accounts |

**Disconnect policy:** Delete token row; leave imported tasks as-is (user can delete manually). Do not mass-delete tasks on disconnect (safer for personal data history).

## Mobile UI

### Settings

- Section **Monday** under Google Tasks.
- List connected accounts (name/slug, last sync, selected board count).
- Per account: board chips/picker, Save, Sync (or one Sync all Monday), Disconnect.
- Primary CTA: **Add Monday account**.

### Tasks

- Source filter includes `monday`.
- Badge label: Monday (optionally show account name from meta in subtitle).
- External fields read-only; Done/Reopen write-back.
- Optional V1.1: filter by account_key / board — not required for first ship.

## Sync / orchestrator changes

1. Remove hard-coded `providerId !== "google_tasks"` upsert branch; use `providerId` for all registered providers.
2. `syncTaskSource('monday')`:
   - Load all token rows for `monday`.
   - For each account: sync with that account’s `selected_list_ids`.
   - Upsert with `source: 'monday'`.
   - Cleanup mark-done: only for external_ids belonging to accounts that were synced (prefix `account_key:` or meta filter).
3. Daily cron already calls all providers — include monday when any account connected.
4. Status write-back: parse `account_key` from `external_id` or `external_meta`; load that token; call Monday mutation.

## Done / open rules (V1)

- Prefer the board’s **first column of type `status`** (store its id in `external_meta.statusColumnId`).
- **Open:** that status value is not done (`is_done !== true`), OR the board has no status column (treat as open).
- **Done in Monday:** status label with `is_done === true`.
- **Complete from app:** set that status column to a done label (prefer label named Done/Complete case-insensitive; else first done label).
- **Reopen from app:** restore `external_meta.statusLabel` if still a valid non-done label; else first non-done label.

Boards without a status column: still pull assigned items; write-back complete/reopen returns a clear error and the UI reverts local status.

## SRS additions

### FR-INT-TASKS-08
User may connect one or more Monday.com accounts via OAuth; each account can be disconnected independently.

### FR-INT-TASKS-09
Per Monday account, user selects which boards to sync (`selected_list_ids`).

### FR-INT-TASKS-10
Sync imports items assigned to the connected user from selected boards that are not Done into `myself.tasks` with `source = 'monday'`.

### FR-INT-TASKS-11
Completing or reopening a Monday-sourced task updates Monday status; failure reverts local status and shows an error.

### FR-INT-TASKS-12
Monday-sourced title/due/notes are read-only in V1; priority may be edited locally.

### FR-INT-TASKS-13
Mobile Settings exposes Monday multi-account connect, board picker, sync status, Sync, and Disconnect.

### FR-INT-TASKS-14
`integration_tokens` supports multiple rows per provider via `account_key` (Google Tasks uses empty `account_key`).

## Out of scope

- Pasting personal API tokens as the primary UX
- Mapping Monday boards ↔ MySelf projects
- Subitems as first-class tasks
- Creating Monday items from MySelf
- Webhooks / realtime push
- Legacy `/legacy` UI
- Unifying Google Calendar + Google Tasks tokens

## CODE QUALITY notes

- Resolve pending note: multi-account via `(provider, account_key)` on `integration_tokens` (no separate `integration_settings` table in V1).
- `[PENDING REFACTOR]: Prefer Monday OAuth 2.1 (expiring tokens + refresh) when app is migrated off legacy OAuth.`
- `[PENDING REFACTOR]: Extract shared Settings “external source card” UI for Google Tasks + Monday.`

## Estimated effort

| Piece | Days |
|---|---|
| Migration + token helpers multi-account | 0.5 |
| Monday OAuth connect/callback + env | 0.5 |
| GraphQL client + map + provider | 1.5 |
| Accounts/boards/settings/disconnect APIs | 0.5 |
| Orchestrator multi-account + write-back | 1 |
| Mobile Settings + Tasks filter/i18n | 1 |
| Tests + docs + SRS | 0.5 |
| **Total** | **~5.5** |
