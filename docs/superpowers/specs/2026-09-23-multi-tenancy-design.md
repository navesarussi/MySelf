# Multi-Tenancy Retrofit — Design

## Goal

MySelf is allowlisted for two real accounts (`navesarussi@gmail.com`, `lianbh2004@gmail.com` — see
`supabase/migrations/0012_allowed_google_emails.sql`), and session tokens already carry per-account
identity (`lib/auth.ts`, `sub: email`). But nothing in the data layer knows about that identity: the
app has exactly one Supabase client (`lib/supabase.ts`), authenticated with the service-role key
(bypasses RLS unconditionally), and none of the 43 tables in the `myself` schema have an owner column.
Every migration that predates this design literally says "(single-user app)" in its header comment.
Today, either allowlisted account sees and can mutate 100% of everything — habits, tasks, relationships,
finance, trading, notification tokens, all of it, mixed into one pool.

This design adds real per-account data isolation for the domains that need it, without introducing a
second identity system or Postgres-native RLS machinery the app doesn't need yet (see Enforcement below
for why).

**SRS mapping (new):** implementation will add an `FR-TENANCY-*` requirement block to `docs/SSOT/SRS.md`
covering account-scoped data access; it modifies the data-access contract of every existing personal-data
`FR-*` area rather than replacing them.

**Out of scope:** the large Expo screens noted separately (`timeline-canvas.tsx`, `timeline.tsx`,
`settings.tsx`) are an unrelated cleanup and not addressed here.

## Decisions (approved)

| Topic | Choice |
|---|---|
| Who this is for | Two real accounts today (you + lianbh2004), designed as true multi-user, not just hardening |
| Data model | Mixed: personal / shared-household / system-single-owner, classified per table (below) — not "isolate everything" |
| Identity table | Extend `allowed_google_emails` in place with a `uuid` primary key rather than adding a parallel `users` table |
| Backfill | All existing rows in personal tables currently belong to you; assign them your id, no split needed |
| Trading | Stays one shared engine tied to your single Alpaca account — access-controlled to the primary account only, not row-partitioned |
| Finance | Stays a shared household pool, visible to both allowlisted accounts, not row-partitioned |
| Enforcement | Structural app-layer scoping (query helper that can't be bypassed) + default-deny RLS as cheap insurance. **Not** per-request Supabase-JWT/`auth.uid()` plumbing — see rationale below |

## Table classification (43 tables)

### Personal — gets `user_id`, hard isolation (18)

`timeline_events`, `timeline_event_links`, `habits`, `habit_reports`, `goals`, `commitments`,
`life_periods`, `content_entries`, `relationships`, `tasks`, `projects`, `agent_settings`,
`agent_messages`, `agent_actions`, `notification_preferences`, `notification_log`, `push_tokens`,
`integration_tokens`.

Several of these currently use a hardcoded single-row pattern (`id boolean primary key default true
check (id)` — `agent_settings`, `notification_preferences`) or have no per-account uniqueness scope at
all (`push_tokens.expo_push_token` globally unique, `integration_tokens` keyed on `(provider,
account_key)` with no account component). These need real schema changes, not just an added column.

### Shared household — no `user_id`, both accounts see everything (5)

`finance_transactions`, `finance_month_plans`, `finance_plan_lines`, `finance_merchant_rules`,
`finance_wealth_items`.

Access stays gated to allowlisted accounts generally (unchanged from today); no row-level split.

### System / single-owner — no `user_id`, access restricted to the primary account (19)

All 18 `trading_*` tables (`trading_backtests`, `trading_calendar`, `trading_chat_messages`,
`trading_committee_gate_evals`, `trading_committee_reflections`, `trading_committee_runs`,
`trading_cron_tokens`, `trading_equity_snapshots`, `trading_events`, `trading_intraday_universe`,
`trading_lessons`, `trading_param_sets`, `trading_playbook`, `trading_proposals`, `trading_settings`,
`trading_trades`, `trading_triggers`, `trading_universe`) plus `coding_agent_jobs`.

These are singleton state for one automated strategy engine / one Alpaca account, or (for
`coding_agent_jobs`) internal devops bookkeeping — not end-user data that could belong to "you" vs
"lian". The fix here is a route-level guard: only the primary account's session may reach `trading_*`
endpoints at all. `coding_agent_jobs` isn't reachable by end-user routes and needs no gate beyond what
exists.

### Identity (1)

`allowed_google_emails` — becomes the `user_id` foreign-key target (see below); not itself owned.

## Identity model

Add `id uuid primary key default gen_random_uuid()` to `myself.allowed_google_emails` in place, rather
than introducing a separate `users` table. It already carries `email` (unique) and `is_primary`, which is
exactly what's needed: `is_primary = true` is the account trading/system routes restrict to. Every new
`user_id` column is `references myself.allowed_google_emails (id)`.

Request-time resolution: `sessionIdentity(req)` (`lib/api/auth.ts`) already returns `{ sub: email, ... }
| null`. A new helper resolves `email → id` (cached per request) to get the `user_id` a route needs.

**Legacy tokens:** `lib/auth.ts` still accepts pre-identity "legacy" tokens (one constant string,
anonymous, still valid unless `SESSION_REJECT_LEGACY=1`) — `sessionIdentity()` already returns `null` for
these by design ("callers that need a name ... must not invent an identity"). Any personal-data or
trading route therefore requires a non-null identity and must reject a legacy-token request outright
(401), independent of whether `SESSION_REJECT_LEGACY` is flipped globally. Flipping that env var is a
separate, simpler cleanup once the installed fleet has rolled onto v2 tokens.

## Backfill

Since all real usage to date is yours, the migration that adds `user_id` to each personal table
backfills every existing row to your `allowed_google_emails.id`, then sets the column `not null`. Lian's
account starts with an empty personal data set going forward. No row-by-row attribution problem exists
because there's nothing to disambiguate — confirmed this is not a mixed-data situation.

## Enforcement

**Chosen approach: structural app-layer scoping.**

Mobile and web never hold Supabase credentials and never call Supabase directly (no anon key appears
anywhere in the repo) — every one of the ~89 `getSupabase()` call sites lives in `app/api/**`, behind
this server's own session-cookie auth. The server is the entire trust boundary today. Given that, the
actual bug being fixed is "an API route queries a personal table without a `user_id` filter" — an
application-code correctness problem, not a missing database permission.

The fix: a small helper each personal-table call site must go through, e.g.

```ts
scopedTable(userId, "tasks")   // returns a query builder pre-filtered to .eq("user_id", userId)
                                 // and auto-stamps user_id on insert
```

so a route cannot select/update/delete a personal table without supplying the caller's `user_id` — the
helper, not each route author's memory, is what makes the filter mandatory. Refactoring the ~89 call
sites onto this helper (or the plain client, for shared/system tables) is the bulk of implementation
work.

Paired with `enable row level security` + a default-deny policy on all 18 personal tables anyway, purely
as insurance: it does nothing against the service-role client used today, but means if anything else
ever gets a connection to this database (Realtime, a script, a future non-server client), the default is
"see nothing" rather than "see everything."

**Rejected for now: real Postgres-native RLS via `auth.uid()`.** Would require minting per-request
Supabase-signed JWTs and moving personal-table queries off the service-role key onto an anon-key client
so `auth.uid()` resolves inside policies. That's meaningful additional machinery — a second
identity-propagation path alongside the existing session-cookie system — to defend against a threat that
doesn't exist today, since nothing but this one server ever reaches the database. Revisit if a client
that bypasses the Next.js server (direct mobile-to-Supabase, Realtime subscriptions, etc.) is ever added.

## Trading & finance access control

- **Trading:** every `trading_*` route requires `sessionIdentity()` to resolve to the row where
  `is_primary = true`. Any other authenticated (or legacy/anonymous) session gets 401/403.
- **Finance:** unchanged access model — any allowlisted, identified account may read/write; no per-row
  split.

## Rollout sequencing

1. Migration: add `id` to `allowed_google_emails`; add nullable `user_id` to the 18 personal tables;
   backfill to the primary account's id; set `not null`; add indexes.
2. Fix structural schema gaps on `agent_settings` / `notification_preferences` (drop the singleton-row
   pattern, one row per account) and `push_tokens` / `integration_tokens` (add account scope to their
   uniqueness constraints).
3. Build the `scopedTable` helper and the request-time `user_id` resolver.
4. Refactor personal-table call sites (~89 total across all domains; personal-table subset) onto the
   helper, one API domain at a time (timeline, habits/goals/commitments, tasks/projects, relationships,
   agent, notifications/push, integrations).
5. Add the primary-account gate to all `trading_*` routes.
6. Enable RLS + default-deny policies on the 18 personal tables.
7. Confirm `SESSION_REJECT_LEGACY` cutover readiness (separate, smaller follow-up).

Each domain in step 4 can ship as its own reviewable slice; the migration and helper in steps 1–3 are the
shared foundation everything else depends on.
