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

## Notes
- Never mutate cookies inside Server Components (layout). Flash toast is set in Server Actions and read/cleared on the client.
