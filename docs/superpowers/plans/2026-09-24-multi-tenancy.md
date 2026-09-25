# Multi-Tenancy Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate the 18 personal tables per account, keep finance shared and trading primary-only, without breaking the code deployed while the schema changes.

**Architecture:** `user_id text` (the account email, FK to `allowed_google_emails.email`) on every personal table. Personal tables are reachable only through `await userDb()`, whose query builders filter/stamp `user_id` for the *current user*: an explicit `runAsUser()` context (AsyncLocalStorage) when set — crons, webhook, OAuth callbacks, `after()` — otherwise the verified session of the current Next request (`headers()`/`cookies()`). No user → throw (fail closed). `getSupabase()` rejects personal tables at compile time and runtime, so the typechecker lists every unmigrated call site.

**Tech Stack:** Next.js 16 route handlers (Node runtime), supabase-js 2 (PostgREST), Postgres 15 on Supabase, `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-23-multi-tenancy-design.md`

## Global Constraints

- Personal tables (exactly these 18): `timeline_events`, `timeline_event_links`, `habits`, `habit_reports`, `goals`, `commitments`, `life_periods`, `content_entries`, `relationships`, `tasks`, `projects`, `agent_settings`, `agent_messages`, `agent_actions`, `notification_preferences`, `notification_log`, `push_tokens`, `integration_tokens`.
- `user_id` = lower-cased account email (`SessionClaims.sub`). Never a uuid.
- Finance tables: untouched (shared household pool). Trading tables: untouched schema; routes gated to the primary account.
- Migrations merged to `main` auto-apply via `db-apply.yml`. **Expand (0043) is applied by hand before the code PR merges; contract (0044) ships in a separate, later PR.** A hand-applied migration gets its ledger row: `checksum` = first 16 hex chars of sha256(file).
- `package.json` version bump on the merge to main: **2.0.0** (CLAUDE.md: `major` for breaking data-model/auth changes — legacy tokens stop working on data routes).
- Verification command for every task: `npm run verify` (typecheck + `node --test`).

---

### Task 1: Tenancy core — table list, user context, scoped query builders

**Files:**
- Create: `lib/db/tenancy.ts`, `lib/db/user-context.ts`, `lib/db/scoped.ts`
- Test: `lib/__tests__/tenancy-scoped.test.ts`, `lib/__tests__/user-context.test.ts`

**Interfaces — Produces:**
- `PERSONAL_TABLES`, `type PersonalTable`, `isPersonalTable(t: string): t is PersonalTable`
- `runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T>`; `explicitUserId(): string | undefined`; `class NoUserContextError`
- `scopedClient(base: { from(t: string): any }, userId: string): ScopedDb` where `ScopedDb = { userId: string; from(table: PersonalTable): QueryBuilder }` — select/update/delete get `.eq("user_id", userId)`; insert/upsert/update have `user_id` stamped (overriding caller values).

- [ ] **Step 1: Failing tests** — fake base client records method calls; assert select→`eq("user_id", uid)`, delete→`eq`, update stamps + `eq`, insert stamps objects and arrays, upsert stamps and passes opts through, `from("finance_transactions")` throws, a caller-supplied `user_id` is overwritten. `runAsUser` nests (inner wins), survives `await`, and `explicitUserId()` is undefined outside.
- [ ] **Step 2:** `npm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement (code below).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(db): scoped query builders and user context for per-account tables`.

```ts
// lib/db/tenancy.ts
export const PERSONAL_TABLES = [
  "timeline_events", "timeline_event_links", "habits", "habit_reports", "goals", "commitments",
  "life_periods", "content_entries", "relationships", "tasks", "projects", "agent_settings",
  "agent_messages", "agent_actions", "notification_preferences", "notification_log", "push_tokens",
  "integration_tokens",
] as const;
export type PersonalTable = (typeof PERSONAL_TABLES)[number];
const SET: ReadonlySet<string> = new Set(PERSONAL_TABLES);
export const isPersonalTable = (t: string): t is PersonalTable => SET.has(t);
```

```ts
// lib/db/user-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
const store = new AsyncLocalStorage<string>();
export class NoUserContextError extends Error {
  constructor() { super("no_user_context"); this.name = "NoUserContextError"; }
}
export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const id = userId.trim().toLowerCase();
  if (!id) throw new NoUserContextError();
  return store.run(id, fn);
}
export const explicitUserId = (): string | undefined => store.getStore();
```

```ts
// lib/db/scoped.ts
import { isPersonalTable, type PersonalTable } from "@/lib/db/tenancy";
type Row = Record<string, unknown>;
type Base = { from(table: string): any };
const stamp = (v: unknown, userId: string) =>
  Array.isArray(v) ? v.map((r: Row) => ({ ...r, user_id: userId })) : { ...(v as Row), user_id: userId };

export function scopedClient<B extends Base>(base: B, userId: string) {
  return {
    userId,
    from(table: PersonalTable): ReturnType<B["from"]> {
      if (!isPersonalTable(table)) throw new Error(`not_a_personal_table:${table}`);
      const qb = base.from(table);
      return {
        select: (...a: unknown[]) => qb.select(...a).eq("user_id", userId),
        insert: (v: unknown, ...a: unknown[]) => qb.insert(stamp(v, userId), ...a),
        upsert: (v: unknown, ...a: unknown[]) => qb.upsert(stamp(v, userId), ...a),
        update: (v: unknown, ...a: unknown[]) => qb.update(stamp(v, userId), ...a).eq("user_id", userId),
        delete: (...a: unknown[]) => qb.delete(...a).eq("user_id", userId),
      } as ReturnType<B["from"]>;
    },
  };
}
export type ScopedDb = ReturnType<typeof scopedClient>;
```

### Task 2: Identity resolution, `userDb()`, account helpers, auth gates

**Files:**
- Create: `lib/db/current-user.ts`, `lib/db/users.ts`
- Modify: `lib/supabase.ts` (add `userDb`, `getUnscopedSupabase`; `getSupabase` unchanged until Task 7), `lib/api/auth.ts`, `app/api/v1/session/route.ts`
- Test: `lib/__tests__/for-each-user.test.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
- `currentUserId(): Promise<string>` — `explicitUserId()` ?? session of current request (Bearer, then cookie, v2 only) ?? throw `NoUserContextError`.
- `userDb(): Promise<ScopedDb>`; `getUnscopedSupabase()` (raw service client).
- `listAccountEmails(): Promise<string[]>`, `primaryAccountEmail(): Promise<string | null>` (DB `is_primary`, else first `ALLOWED_GOOGLE_EMAIL`), `forEachAccount<T>(fn: (email) => Promise<T>, deps?)` → `{ email, ok, result?, error? }[]` (each inside `runAsUser`, sequential, one failure doesn't stop the rest), `runAsPrimary<T>(fn)` (skips when no primary).
- `ensureAccountRow(email)` — upsert into `allowed_google_emails` (FK target for env-allowlisted accounts).
- `lib/api/auth.ts`: `isApiAuthorized` requires identity; `hasValidSession` = old behaviour (legacy allowed; only the session probe uses it); `isPrimaryAuthorized(req)`.

- [ ] Steps: failing test for `forEachAccount` (injected account list + fn; asserts per-account context via `explicitUserId()`, error isolation, order) → implement → pass → switch `session/route.ts` to `hasValidSession` → `npm run verify` → commit `feat(auth): resolve the current account for data access`.

### Task 3: Migration 0043 (expand)

**Files:** Create `supabase/migrations/0043_multi_tenancy_expand.sql`

Safe for the code deployed today: every new column has a default of the primary account; new per-user unique indexes are added *next to* the old ones.

- `myself.primary_user_email()` (`stable`, SQL).
- For each of the 18 tables: `add column if not exists user_id text not null default myself.primary_user_email() references myself.allowed_google_emails (email) on update cascade` + `(user_id)` index. (Existing rows are filled with the default during the add.)
- Per-user unique indexes (non-partial, so PostgREST `onConflict` can use them): `timeline_events (user_id, google_event_id)`, `tasks (user_id, source, external_id)`, `projects (user_id, name)`, `habit_reports (user_id, habit_id, report_date)`, `notification_log (user_id, notif_type, ref_id, day_key)`, `integration_tokens (user_id, provider, account_key)`.
- Singletons `agent_settings`, `notification_preferences`: drop PK on `id`, make `id` nullable without default, PK on `user_id` (old code's `.eq("id", true)` still finds the primary row).

- [ ] Validate against production inside `begin; … rollback;` (read-only in effect) → commit `feat(db): add per-account user_id to personal tables (expand)`.

### Task 4: Move personal-table call sites onto `userDb()`

**Files:** every file listed by `grep -rnE 'from\(["'"'"'](<personal tables>)["'"'"']\)' app lib` (~230 sites, ~60 files). Rules:
- `getSupabase().from("<personal>")` → `(await userDb()).from("<personal>")`; `const supabase = getSupabase()` used only for personal tables → `const supabase = await userDb()`; mixed functions keep both (`db` for personal).
- `onConflict`: `"habit_id,report_date"` → `"user_id,habit_id,report_date"`; `"provider,account_key"` → `"user_id,provider,account_key"`; `"source,external_id"` → `"user_id,source,external_id"`; `"google_event_id"` → `"user_id,google_event_id"`; `"notif_type,ref_id,day_key"` → `"user_id,notif_type,ref_id,day_key"`; `"expo_push_token"` unchanged (device reassigned to the account registering it).
- Singletons: drop `.eq("id", true)`; writes become `upsert({...}, { onConflict: "user_id" })` (the second account has no row yet).
- Parent ids from request bodies (`tasks.project_id` on POST/PATCH) are checked with a scoped select first → 400 `project_not_found`.
- Push send-log client (`lib/push/claim.ts`): `sendLogClient()` becomes async and returns the scoped client.

- [ ] Commit per domain (integrations; agent; push/notifications; timeline/habits/goals/commitments/tasks/projects/relationships/library/home; maintenance; legacy), `npm run verify` green each time.

### Task 5: Entry points without a session

- Crons `agent/motivate`, `agent/health`, `push/dispatch`, `integrations/google/sync`, `integrations/task-sources/sync`, `integrations/data-integrity`: body → per-account function run through `forEachAccount`; response = per-account results.
- WhatsApp webhook: `findAccountByWhatsAppPhone(from)` (unscoped read of enabled `agent_settings` rows, `phonesMatch`) → unknown sender ignored as today; claim + `after()` processing inside `runAsUser`.
- `after()` callbacks (`v1/sync`, `v1/integrations/task-sources/sync`, `schedule-data-integrity-cleanup`, Google OAuth callback): capture `currentUserId()` before, `runAsUser` inside.
- Google login callback: `ensureAccountRow(email)`; token save + sync inside `runAsUser(email)`; still primary-only.
- GitHub/Monday: state = `mintScopedToken(secret, "oauth-state", email, { ttlSeconds: 600 })` at connect; callback verifies it and runs inside `runAsUser(claims.sub)`.
- Trading `logEvent` pushes: `runAsPrimary(() => sendPush(...))`.
- `proxy.ts` `/legacy`: require a v2 token (`readSessionToken`).

- [ ] Commit `feat(tenancy): pick the account explicitly where no session exists`.

### Task 6: Trading routes → primary account only

- [ ] Every `app/api/v1/trading/**/route.ts` using `isApiAuthorized` → `isPrimaryAuthorized` (403 `forbidden` for other accounts). Commit.

### Task 7: Close the door

- [ ] `getSupabase()` returns a client whose `from()` rejects personal tables (type: parameter is `never` for a personal literal; runtime: throws). `npm run typecheck` must show zero errors — any error is an unmigrated site.
- [ ] Test: `from("tasks")` on the guarded client throws; `from("finance_transactions")` passes.
- [ ] Static test: `getUnscopedSupabase` is imported only by `lib/db/users.ts`, `lib/agent/account-by-phone.ts`, `lib/integrations/google-auth.ts`.
- [ ] Commit `feat(db): personal tables are unreachable without an account`.

### Task 8: Ship

- [ ] Version 2.0.0, `FR-TENANCY-*` block in `docs/SSOT/SRS.md`, `npm run verify`, PR with the runbook: (1) apply 0043 by hand + ledger row, (2) merge, (3) verify prod, (4) open the contract PR.
- [ ] Contract PR (`0044_multi_tenancy_contract.sql`, separate branch, merged only after step 3): drop the `user_id` defaults and `primary_user_email()`, the old global unique indexes/constraints, singleton `id` columns; `integration_tokens` PK → `(user_id, provider, account_key)`.
