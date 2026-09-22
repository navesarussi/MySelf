# CODE QUALITY — MySelf

## Current architecture
Next.js App Router flat structure (`app/`, `components/`, `lib/`). Server Actions + Supabase client with `db.schema: "myself"`.

## Constraints
- **npm only.** `package-lock.json` is the single lockfile; there is no `yarn.lock` and no `packageManager` field. Adding a dependency without regenerating the lockfile in use is what broke all three finance syncs for a week (`pg` landed in `package.json`, `yarn.lock` was never regenerated, `yarn --frozen-lockfile` then failed every run).
- Max ~200 lines per file; split UI sections when needed.
- Prefer localized changes; no speculative abstractions.
- Docs in English.
- Client state & cache architecture lives in `mobile/src/query/` (TanStack Query) to provide optimistic updates, per-item pending states, and avoid redundant screen refetches. Cache persistence is in `mobile/src/query/persist.ts` (skips timeline events). Native lists use FlashList via `ScreenList`.

## [PENDING REFACTOR]
- `lib/i18n/messages.ts` is 2149 lines but healthy: he and en have identical key sets (1012 each) and every one of the 777 literal `t("…")` keys in the codebase is defined. Splitting it is a merge-conflict question, not a correctness one.
- **Multi-tenancy** — see `docs/architecture/multi-tenancy.md`. 40 tables, 0 with `user_id`, 334 query sites, and 3 tables (`agent_settings`, `trading_settings`, `notification_preferences`) whose `id boolean PRIMARY KEY CHECK (id)` admits exactly one row. The session token is `hmac(secret, "authenticated-v1")` — a constant, so it carries no identity, no expiry and cannot be revoked per user. Identity has to land before any schema work.
- `lib/supabase.ts` builds a single service-role client, which bypasses RLS. Request-path queries need a per-user client before any RLS policy means anything.
- `dailyScreen` in `lib/trading/engine.ts` walks the universe serially: one market-data fetch and one UPDATE per symbol. Bounded-concurrency pools already exist in `intraday-data.ts` and `intraday-universe.ts` — reuse one here. Daily cron, so low urgency.
- Introduce `/domain` + `/application` + `/infrastructure` layers when the surface area grows past current pages.
- Unify Server Action return types (Result pattern) instead of flash cookies only.
- Unify Google OAuth tokens (calendar + tasks) into one Google credential row with incremental scopes.
- When a third external task source ships, consider `integration_settings` table if `settings` jsonb on `integration_tokens` becomes awkward.
- [PENDING REFACTOR]: Prefer Monday OAuth 2.1 (expiring tokens + refresh) when app is migrated off legacy OAuth.
- [PENDING REFACTOR]: Extract shared Settings “external source card” UI for Google Tasks + Monday + GitHub.
- [PENDING REFACTOR]: Split `mobile/src/components/github-settings.tsx` (404, grouped repo picker) under 200 lines.
- Layout direction is owned by `lib/layout-dir.ts` + `mobile/src/layout-dir.ts`. Do not hardcode `flexDirection: "row"` for locale-sensitive stacks.
- Appearance preference is owned by `lib/appearance.ts` + `mobile/src/theme.tsx` (`system` | `light` | `dark`).
- Home dashboard is split into `mobile/src/components/home/home-hero.tsx`, `home-kpi-section.tsx`, `home-habits-feed.tsx`, `home-lists-feed.tsx`.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/relationships.tsx` (432; device import + form + list) under 200 lines.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/timeline.tsx` (692) chronological/period accordion helpers under 200 lines.
- Agent tools are one module per domain (`lib/agent/tools-*.ts`), composed in `tools.ts`; `withLog` is shared from `tools-log.ts`. Add a new tool to its domain module, not to `tools.ts`.
- [PENDING REFACTOR]: Split `lib/agent/data.ts` (247) and `lib/agent/tools-extra.ts` (206) under 200 lines.
- [PENDING REFACTOR]: Lift per-card modals from `HabitCard` to screen-level `FormModal` (implemented during instant UX infrastructure).
- [PENDING REFACTOR]: TimelineCanvas clustering still runs on the JS thread (out of NFR-UX-04/05 pass).
- [PENDING REFACTOR]: Split `lib/finance/plan-store.ts` (222) under 200 lines. `plan.ts` is already at 147.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/finance.tsx` (211) under 200 lines.

## Notes
- Never mutate cookies inside Server Components (layout). Flash toast is set in Server Actions and read/cleared on the client.
- **iOS home widget:** WidgetKit extension target is added via `@bacons/apple-targets` (`mobile/targets/HomeWidget/`). Main app and widget share snapshot JSON through App Group `group.com.navesarussi.myself` (entitlements wired by `mobile/plugins/with-home-widget.js`). Auth tokens stay in Keychain for App Intents — never in the snapshot file.
