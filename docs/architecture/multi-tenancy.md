# Multi-tenancy readiness

Written 2026-09-18 from an audit of the repo at `7915d6a`. Numbers below are
measured, not estimated.

The product direction is "a personal, individual app per user". Nothing in the
current data or auth layer supports more than one user, so this records exactly
what blocks it and in what order to remove it.

## Where it stands

| Fact | Measured |
|---|---|
| Tables in the `myself` schema | 40 |
| Tables with a `user_id` / `owner_id` column | 0 |
| Tables with row-level security enabled | 3 of 40 |
| `.from("…")` call sites in `app/` + `lib/` | 334 |
| Tables that physically cannot hold a second row | 3 |
| Distinct identities the auth layer can express | 1 |

### The three hard singletons

`agent_settings`, `trading_settings` and `notification_preferences` are each
declared as:

```sql
id boolean PRIMARY KEY DEFAULT true CHECK (id)
```

The `CHECK (id)` constraint means the table admits exactly one row, forever.
Code reads them as `.eq("id", true).maybeSingle()`. These need a primary-key
change, not just a new column — they are the clearest statement in the schema
that the product assumes one user.

### The auth layer has no concept of identity

`lib/auth.ts` issues the session token as:

```ts
hmac(secret, "authenticated-v1")
```

The payload is a constant. Consequences:

- every session everywhere carries the **same** token value;
- the token encodes no user, no issue time and no expiry;
- it cannot be revoked short of rotating `AUTH_SECRET`, which signs out
  everyone at once;
- a token that leaks once stays valid indefinitely.

`isValidSessionToken` compares with `===`, and `isFinanceIngestAuthorized`
compares the ingest token the same way. Neither is constant-time. That is a weak
side channel for a remote attacker, but it costs nothing to fix.

This is the root blocker: no amount of schema work matters until a request can
say *which* user it belongs to.

## Suggested order

Each phase leaves the app working. Do not start phase 3 before phase 2 is real,
or the service-role key keeps bypassing every policy written.

### Phase 1 — identity in the token (no schema change)

Move to a signed token carrying `{ sub, iat, exp }`. Keep accepting the legacy
constant token behind a flag for one release so existing installs are not signed
out, then drop it. Add a `users` table seeded with the current owner, and
resolve `sub` to a user on every request.

Deliverable: `getCurrentUser(req)` returning a real id, used nowhere yet.

### Phase 2 — `user_id` everywhere, backfilled

Add `user_id uuid NOT NULL REFERENCES myself.users(id)` to all 40 tables,
backfilled to the owner's id and defaulted to it so existing writes keep
working. Rework the three singletons to `PRIMARY KEY (user_id)`.

Then thread the user through the 334 query sites. Doing that by hand is where
this goes wrong — better to funnel table access through a small helper that
takes the user and applies the filter, so the filter cannot be forgotten. A
missing filter in this phase is a silent cross-user data leak, and there is
currently no test that would catch one.

### Phase 3 — RLS, and stop using the service-role key

`lib/supabase.ts` builds one client with `SUPABASE_SERVICE_ROLE_KEY`, which
bypasses RLS entirely. Policies are therefore worthless until requests run as
the user. Enable RLS on all 40 tables with a `user_id = auth.uid()` policy and
move request-path queries onto a per-request client carrying the user's JWT.
Keep the service-role client only for cron and admin paths.

This is the phase that turns tenancy from a convention the code has to remember
into something the database enforces.

### Phase 4 — per-user integrations

`integration_tokens` is keyed by provider alone (14 call sites), so there is one
GitHub token, one Monday token and one Google token for the whole
installation. It needs `(user_id, provider)`.

Related: the OAuth connect routes had no auth check until `16ebd97`, which meant
anyone could bind their own account over the owner's token. With per-user tokens
that becomes a cross-tenant takeover rather than a single-owner one, so the
guard has to stay.

## Cost note

Phase 2 is the expensive one: 40 tables and 334 call sites. Phases 1 and 3 are
small by comparison. The sequencing matters more than the speed — identity
first, enforcement last, and no phase that leaves the schema half-tenanted.
