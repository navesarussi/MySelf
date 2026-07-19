# CODE QUALITY — MySelf

## Current architecture
Next.js App Router flat structure (`app/`, `components/`, `lib/`). Server Actions + Supabase client with `db.schema: "myself"`.

## Constraints
- Max ~200 lines per file; split UI sections when needed.
- Prefer localized changes; no speculative abstractions.
- Docs in English.

## [PENDING REFACTOR]
- Introduce `/domain` + `/application` + `/infrastructure` layers when the surface area grows past current pages.
- Unify Server Action return types (Result pattern) instead of flash cookies only.
- Unify Google OAuth tokens (calendar + tasks) into one Google credential row with incremental scopes.
- When a third external task source ships, consider `integration_settings` table if `settings` jsonb on `integration_tokens` becomes awkward.
- [PENDING REFACTOR]: Prefer Monday OAuth 2.1 (expiring tokens + refresh) when app is migrated off legacy OAuth.
- [PENDING REFACTOR]: Extract shared Settings “external source card” UI for Google Tasks + Monday.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/index.tsx` further (habits / relationships / stats sections) — still ~450 lines after goal/library modal extract.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/relationships.tsx` (device import + form + list) — ~330 lines after email/device picker.

## Notes
- Never mutate cookies inside Server Components (layout). Flash toast is set in Server Actions and read/cleared on the client.
