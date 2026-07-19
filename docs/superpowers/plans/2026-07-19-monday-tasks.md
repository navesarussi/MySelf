# Monday.com Multi-Account Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect multiple Monday.com accounts (personal + work), pick boards per account, sync items assigned to them that are not Done into the Tasks inbox, and write complete/reopen back to Monday.

**Architecture:** Extend `integration_tokens` with `account_key` for multi-account rows; implement a Monday OAuth + GraphQL adapter behind the existing `TaskSourceProvider` port; orchestrator syncs all Monday accounts when `provider === "monday"`; Expo Settings UI mirrors Google Tasks but as an account list with «Add account».

**Tech Stack:** Next.js API routes, Supabase Postgres, Monday GraphQL (`api.monday.com/v2`), Expo Settings/Tasks, Vitest for domain/helpers.

**Spec:** `docs/superpowers/specs/2026-07-19-monday-tasks-design.md`

## Global Constraints

- Expo app primary (`mobile/` + SPA); do not polish `/legacy`.
- Map work to FR-INT-TASKS-08–14; update `docs/SSOT/SRS.md` in the docs task.
- Max ~200 lines/file; split Monday client/map/provider if needed.
- Bump root + mobile `package.json` version (minor) when shipping.
- No secrets in git; use Vercel env for `MONDAY_*`.
- Prefer localized changes; do not refactor Google Calendar tokens in this plan.
- Tests for new domain/application helpers (map, external id, token key helpers).

---

## File structure (create / modify)

| Path | Responsibility |
|---|---|
| `supabase/migrations/0015_monday_multi_account_tokens.sql` | `(provider, account_key)` PK; nullable refresh/expires |
| `lib/integrations/tokens.ts` | Multi-account get/list/save/delete |
| `lib/integrations/monday-config.ts` | Provider id, scopes, env helpers |
| `lib/integrations/task-sources/monday/client.ts` | OAuth URL, token exchange, GraphQL |
| `lib/integrations/task-sources/monday/map.ts` | Item → `ExternalTaskDraft` |
| `lib/integrations/task-sources/monday/provider.ts` | `createMondayProvider(accountKey)` |
| `lib/integrations/task-sources/monday/types.ts` | GraphQL response types |
| `lib/integrations/task-sources/monday/ids.ts` | `makeMondayExternalId` / parse |
| `lib/integrations/task-sources/registry.ts` | Register monday |
| `lib/integrations/task-sources/orchestrator.ts` | Multi-account monday sync + generic upsert |
| `app/api/integrations/monday/connect/route.ts` | Start OAuth |
| `app/api/integrations/monday/callback/route.ts` | Exchange + redirect |
| `app/api/v1/integrations/monday/accounts/route.ts` | List accounts |
| `app/api/v1/integrations/monday/boards/route.ts` | Board picker |
| `app/api/v1/integrations/monday/settings/route.ts` | PATCH selected boards |
| `app/api/v1/integrations/monday/disconnect/route.ts` | Disconnect one account |
| `mobile/app/settings.tsx` | Monday UI section |
| `mobile/src/api/resources.ts` | API client methods |
| `mobile/app/(tabs)/tasks.tsx` | Source filter `monday` |
| `mobile/src/components/task-card.tsx` | Badge label |
| `lib/i18n/messages.ts` | HE/EN strings |
| `docs/SSOT/SRS.md` | FR-INT-TASKS-08–14 |
| `.env.example` | `MONDAY_*` vars |
| `lib/__tests__/monday-*.test.ts` | Unit tests |

---

### Task 1: Migration — multi-account tokens

**Files:**
- Create: `supabase/migrations/0015_monday_multi_account_tokens.sql`
- Modify: `lib/types.ts` (IntegrationToken type if present)
- Test: manual SQL review; typecheck after Task 2

**Interfaces:**
- Produces: table PK `(provider, account_key)`; `account_key text not null default ''`; `refresh_token` and `expires_at` nullable

- [ ] **Step 1: Write migration**

```sql
-- Drop old PK on provider; add account_key; composite PK.
-- Backfill account_key = '' for existing rows.
-- Alter refresh_token and expires_at to DROP NOT NULL.
```

- [ ] **Step 2: Apply locally / document for prod**

Apply via Supabase CLI or dashboard on the project used by production before deploy depends on it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0015_monday_multi_account_tokens.sql
git commit -m "db: multi-account integration_tokens via account_key"
```

---

### Task 2: Token helpers — account_key aware

**Files:**
- Modify: `lib/integrations/tokens.ts`
- Create: `lib/__tests__/integration-tokens-account.test.ts` (pure helpers if extracted)
- Modify: all call sites of `getIntegrationToken` / `saveIntegrationToken` to pass `accountKey = ''` for Google (default param keeps Google working)

**Interfaces:**
- Consumes: new table shape
- Produces:
  - `getIntegrationToken(provider, accountKey = '')`
  - `listIntegrationTokens(provider)` → rows[]
  - `saveIntegrationToken({ ..., account_key?: string })`
  - `deleteIntegrationToken(provider, accountKey = '')`
  - settings helpers take `accountKey`

- [ ] **Step 1: Update `tokens.ts` with default `accountKey = ''`**
- [ ] **Step 2: Grep call sites; ensure Google Calendar / Google Tasks still work with default**
- [ ] **Step 3: Run existing tests / fix breakages**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: account_key-aware integration token helpers"
```

---

### Task 3: Monday ids + map (TDD)

**Files:**
- Create: `lib/integrations/task-sources/monday/ids.ts`
- Create: `lib/integrations/task-sources/monday/map.ts`
- Create: `lib/integrations/task-sources/monday/types.ts`
- Test: `lib/__tests__/monday-ids.test.ts`, `lib/__tests__/monday-map.test.ts`

**Interfaces:**
- Produces:
  - `makeMondayExternalId(accountKey, itemId): string` → `"${accountKey}:${itemId}"`
  - `parseMondayExternalId(externalId): { accountKey, itemId }`
  - `mapMondayItem(item, ctx) → ExternalTaskDraft | null` (null if done)

- [ ] **Step 1: Write failing tests for id round-trip and map open vs done**
- [ ] **Step 2: Implement ids + map**
- [ ] **Step 3: Run tests — pass**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Monday task id helpers and item mapper"
```

---

### Task 4: Monday config + GraphQL/OAuth client

**Files:**
- Create: `lib/integrations/monday-config.ts`
- Create: `lib/integrations/task-sources/monday/client.ts`
- Modify: `.env.example`
- Test: `lib/__tests__/monday-redirect.test.ts` (redirect URI helper like Google Tasks)

**Interfaces:**
- Consumes: `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET`, `MONDAY_REDIRECT_URI`
- Produces:
  - `mondayRedirectUri(): string`
  - `mondayAuthUrl(state: string): string`
  - `exchangeMondayCode(code): Promise<{ access_token, ... }>`
  - `mondayGraphql<T>(accessToken, query, variables?): Promise<T>`
  - `fetchMondayAccount(accessToken)` → `{ id, name, slug }`
  - `fetchMondayBoards(accessToken)` → `{ id, title }[]`
  - `fetchAssignedOpenItems(accessToken, boardIds, accountKey)` → drafts
  - `completeMondayItem` / `reopenMondayItem`

Scopes: `me:read account:read boards:read boards:write workspaces:read`

GraphQL notes:
- Filter people with `compare_value: ["assigned_to_me"]`
- Use first `status` column for done detection / write-back
- Handle pagination via `items_page` cursors

- [ ] **Step 1: Config + redirect helper + tests**
- [ ] **Step 2: OAuth exchange + graphql wrapper with error surfacing**
- [ ] **Step 3: Boards + assigned items fetch**
- [ ] **Step 4: Complete/reopen mutations**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: Monday OAuth client and GraphQL helpers"
```

---

### Task 5: Monday provider + registry

**Files:**
- Create: `lib/integrations/task-sources/monday/provider.ts`
- Modify: `lib/integrations/task-sources/registry.ts`

**Interfaces:**
- Consumes: client + map + `getIntegrationToken('monday', accountKey)`
- Produces: `createMondayProvider(accountKey: string): TaskSourceProvider` with `id: "monday"`

- [ ] **Step 1: Implement provider methods (listSources, pullOpenTasks, complete, reopen)**
- [ ] **Step 2: Register factory access — keep `getTaskSourceProvider('monday')` returning a thin facade OR document that orchestrator uses `createMondayProvider` directly for multi-account**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: Monday TaskSourceProvider and registry entry"
```

---

### Task 6: Orchestrator — multi-account monday + generic upsert

**Files:**
- Modify: `lib/integrations/task-sources/orchestrator.ts`
- Modify: status write-back path in tasks PATCH (find where Google complete is called)
- Test: extend merge/orchestrator tests if present

**Interfaces:**
- Consumes: `listIntegrationTokens('monday')`, `createMondayProvider`
- Produces: `syncTaskSource('monday')` syncs every Monday account; upsert uses `providerId` not hard-coded google

- [ ] **Step 1: Remove `unsupported_provider_upsert` / hard-coded google source in upsert**
- [ ] **Step 2: For monday, loop accounts; aggregate imported/markedDone**
- [ ] **Step 3: Mark-done cleanup only for external_ids of synced account prefixes**
- [ ] **Step 4: Wire task status PATCH to parse Monday external id and call provider**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: sync all Monday accounts via task-source orchestrator"
```

---

### Task 7: OAuth connect + callback routes

**Files:**
- Create: `app/api/integrations/monday/connect/route.ts`
- Create: `app/api/integrations/monday/callback/route.ts`
- Mirror patterns from `app/api/integrations/google-tasks/*` (state cookie, `app_redirect` allowlist)

**Interfaces:**
- After exchange: `fetchMondayAccount` → `account_key = String(account.id)`
- Upsert token with nullable `refresh_token` / `expires_at`
- Preserve existing `settings.selected_list_ids` if reconnecting same account

- [ ] **Step 1: Connect route**
- [ ] **Step 2: Callback route + redirect to app settings**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: Monday OAuth connect and callback routes"
```

---

### Task 8: v1 Monday REST APIs

**Files:**
- Create: `app/api/v1/integrations/monday/accounts/route.ts`
- Create: `app/api/v1/integrations/monday/boards/route.ts`
- Create: `app/api/v1/integrations/monday/settings/route.ts`
- Create: `app/api/v1/integrations/monday/disconnect/route.ts`
- Modify: `mobile/src/api/resources.ts` (can be same commit or Task 9)

**Interfaces:**
- Accounts payload: `{ accounts: [{ account_key, account_name, account_slug, connected, last_sync_at, sync_status, selected_list_ids }] }`
- Boards: query `account_key` required
- Settings PATCH body: `{ account_key, selected_list_ids: string[] }`
- Disconnect POST body: `{ account_key }` — deletes token only

- [ ] **Step 1: Implement four routes with `isApiAuthorized`**
- [ ] **Step 2: Smoke via curl against local if possible**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: Monday accounts/boards/settings/disconnect APIs"
```

---

### Task 9: Mobile Settings UI + API client

**Files:**
- Modify: `mobile/src/api/resources.ts`
- Modify: `mobile/app/settings.tsx`
- Modify: `lib/i18n/messages.ts` (and mobile i18n if separate)

**Interfaces:**
- Consumes: Monday v1 APIs + connect URL pattern like Google Tasks
- UI: account cards, Add account, board chips, Save, Sync Monday, Disconnect

- [ ] **Step 1: Add `api.mondayAccounts`, `mondayBoards`, `patchMondaySettings`, `disconnectMonday`**
- [ ] **Step 2: Settings section UI (HE/EN)**
- [ ] **Step 3: Connect via `WebBrowser.openAuthSessionAsync` / web redirect
- [ ] **Step 4: Manual UI pass on web + native if available**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: Monday multi-account section in mobile Settings"
```

---

### Task 10: Tasks UI — monday filter + badge

**Files:**
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/src/components/task-card.tsx`
- Modify: i18n strings for `tasks.source.monday`

- [ ] **Step 1: Add `monday` to `SOURCE_FILTERS`**
- [ ] **Step 2: Badge label for monday (optional account_name from meta)**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: show Monday tasks in Tasks source filter"
```

---

### Task 11: Docs, SRS, env, version

**Files:**
- Modify: `docs/SSOT/SRS.md` (FR-INT-TASKS-08–14)
- Modify: `docs/SSOT/CODE QUALITY.md` (pending refactor notes from spec)
- Modify: `.env.example`, `README.md`
- Modify: root + `mobile/package.json` version (minor bump)
- Modify: design status → Approved after user sign-off

**Manual (operator — not code):**
1. Create Monday app at https://developer.monday.com/
2. Scopes + redirect: `https://myselfapp.xyz/api/integrations/monday/callback` (+ localhost)
3. Set Vercel Production env: `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET`, `MONDAY_REDIRECT_URI`
4. Apply migration `0015` on production Supabase
5. Redeploy

- [ ] **Step 1: SRS + CODE QUALITY + README/.env.example**
- [ ] **Step 2: Version bump**
- [ ] **Step 3: Commit**

```bash
git commit -m "docs: Monday tasks SRS and env; bump version"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Connect personal Monday account; select boards; sync; see assigned open items**
- [ ] **Step 2: Connect work account; confirm both listed; sync both**
- [ ] **Step 3: Complete a task in app → Done on Monday; reopen → not Done**
- [ ] **Step 4: Disconnect one account; other still works**
- [ ] **Step 5: Fix any gaps; final commit if needed**

---

## Manual setup checklist (before first prod test)

- [ ] Monday Developer app created
- [ ] OAuth redirect URIs registered
- [ ] Vercel env vars set + redeploy
- [ ] Supabase migration `0015` applied
- [ ] Tasks API enabled… N/A (Monday GraphQL is always on for accounts with API access)

## Risk notes

- Legacy Monday OAuth tokens may not expire — store `expires_at = null`, skip refresh.
- Boards without status column: pull ok; write-back errors gracefully.
- Rate limits / complexity points — page boards and items; backoff on 429 if Monday returns them.
- Work account may require admin to install the Monday app (`force_install_if_needed` optional on authorize URL).
