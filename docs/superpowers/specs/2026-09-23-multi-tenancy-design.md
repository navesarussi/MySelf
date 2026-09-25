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
| Identity table | `allowed_google_emails` is the users table; `user_id text` = the account email, FK to its existing `email` primary key (revised during planning — see Identity model) |
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

`myself.allowed_google_emails` is the users table. Its primary key is already `email`, and it carries
`is_primary` — the account trading/system routes restrict to. Every new column is
`user_id text not null references myself.allowed_google_emails (email) on update cascade`.

*Revised during planning:* the first draft added a `uuid` id. Migration 0040 (finance import, merged
after this spec was written) already established `user_id text` holding the session email, and the session
token's `sub` is that same email — so keying on email needs no new column, no per-request email→id
lookup, and matches the existing convention. `on update cascade` covers an email change.

Request-time resolution: `sessionIdentity(req)` (`lib/api/auth.ts`) returns `{ sub: email, ... } | null`;
`sub` *is* the `user_id`. Since the allowlist can also come from the `ALLOWED_GOOGLE_EMAIL` env var, a
successful login upserts the email into `allowed_google_emails` so the FK target always exists.

**Request-scoped user context.** ~230 call sites touch personal tables, many deep inside call chains
(agent tools → data helpers, push dispatch, sync). Rather than threading `userId` through every signature,
entry points run their work inside `runAsUser(email, fn)` (Node `AsyncLocalStorage`), and personal tables
are reached only through `userDb().from(table)`, which reads the current user and **throws when there is
none** (fail-closed). `getSupabase().from("<personal table>")` becomes a compile-time error and a runtime
throw, so the typechecker enumerates every unscoped call site. The raw unscoped client survives only as
`getUnscopedSupabase()`, allowed in an explicit, test-enforced list of files (cross-user lookups: the
WhatsApp phone → user resolution).

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
userDb().from("tasks")   // select/update/delete get .eq("user_id", <current user>);
                          // insert/upsert/update have user_id stamped (overriding any caller value)
```

so a route cannot select/update/delete a personal table without the caller's `user_id` — the helper,
not each route author's memory, makes the filter mandatory. Moving the ~230 personal-table call sites onto
it is the bulk of implementation work.

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

## Session-less entry points (added during planning)

Not every request carries a session. Each of these must pick the user explicitly:

| Entry point | User |
|---|---|
| Crons: agent motivate, agent health, push dispatch, Google sync, task-sources sync, data-integrity | Fan out: run once per allowlisted account (`forEachUser`), each inside its own `runAsUser` |
| WhatsApp webhook | The account whose `agent_settings.whatsapp_phone` matches the sender (enabled only); unknown sender → ignored as today |
| Trading event pushes (`lib/trading/store.ts`) | Primary account only — today they go to *every* registered device, including the second account's |
| Google login callback | The Google email that just authenticated. Token saving stays primary-only, exactly as today (letting the second account connect her own Google is a later product decision) |
| GitHub / Monday OAuth callbacks | The OAuth `state` becomes a 10-minute signed scoped token carrying the connecting account's email |
| `after()` callbacks | Re-enter `runAsUser` explicitly inside the callback; context propagation into `after()` is not relied on |
| Legacy `/legacy` pages and server actions | Primary account only |

Unique constraints on personal tables that are global today gain a leading `user_id` (a second account
would otherwise collide with the first's rows — e.g. the same Google event id when both are invited, the
same habit name, the same daily notification slot): `timeline_events (google_event_id)`, `tasks (source,
external_id)`, `goals_identity_uidx`, `habits_name_active_uidx`, `habit_reports (habit_id, report_date)`,
`notification_log (notif_type, ref_id, day_key)`, `integration_tokens` PK `(provider, account_key)`.
Left global on purpose: `push_tokens.expo_push_token` (a device that switches accounts is reassigned) and
the WhatsApp `external_id` indexes (Meta message ids are globally unique).

Routes that accept a parent id (a habit id for a report, event ids for a link, a project id on a task)
verify the parent through `userDb()` before writing, so a foreign id can't attach rows to — or expose
through an embedded select — another account's data.

## Rollout sequencing (expand → deploy → contract)

The currently deployed code inserts rows without `user_id` and upserts against the old global unique
keys, so the schema change is split so that each step is safe for the code running at that moment:

1. **Migration 0042 (expand)** — safe for old code: add `user_id` with `default
   myself.primary_user_email()`, backfill, `not null`, FK, index; add the per-user unique indexes
   *alongside* the old ones; move the singleton tables' primary key to `user_id` (their old `id` column
   stays, nullable, so old code's `.eq("id", true)` still finds the primary row).
2. **Deploy the new code** — every write stamps `user_id`; every upsert targets the per-user keys.
3. **Migration 0043 (contract)** — drop the old global constraints, the `user_id` defaults and the
   singleton `id` columns; `enable row level security` on the 18 personal tables (no policies = deny for
   `anon`/`authenticated`; the service role is unaffected).
4. Confirm `SESSION_REJECT_LEGACY` cutover readiness (separate, smaller follow-up). Data routes already
   reject identity-less legacy tokens.

Between steps 1 and 3 the second account can't reuse a habit name or notification slot the first already
holds — the old global constraints are still there. Acceptable for a window of minutes.
