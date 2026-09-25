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
- **Multi-tenancy** — see `docs/architecture/multi-tenancy.md`. 40 tables, 0 with `user_id`, 334 query sites, and 3 tables (`agent_settings`, `trading_settings`, `notification_preferences`) whose `id boolean PRIMARY KEY CHECK (id)` admits exactly one row. **Identity now lands in the token** (`lib/auth.ts`): a v2 session token is `v2.<claims>.<hmac>` carrying `sub` (email), `iat` and `exp`, distinct per user, with a rolling refresh served by `GET /api/v1/session`. `sessionIdentity(req)` in `lib/api/auth.ts` is the read side — the hook the per-user queries will use. Still open: the tables themselves (no `user_id`, no RLS), and per-user revocation, which needs storage the stateless token deliberately avoids. The pre-identity constant token is still accepted so installed builds keep working; `SESSION_REJECT_LEGACY=1` closes that door once the fleet has rolled over.
- `lib/supabase.ts` builds a single service-role client, which bypasses RLS. Request-path queries need a per-user client before any RLS policy means anything.
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
- `lib/trading/engine.ts` is the tick and nothing else (159 lines, was 1299). Its stages are one module each: `advance-positions.ts`, `broker-mirror.ts`, `daily-screen.ts`, `learn-loop.ts`, `scan-v2.ts`, `scan-daily-trend.ts`, with `tick-context.ts` (constants, frame cache, `TickSummary`, `loadAccount`), `trade-insert.ts` (writing a trade row + the agent's experience card) and `strategy-versions.ts` shared between them. Add a stage as a module; the tick only calls it. The two scan files sit at ~260 lines: each is a single scan function, and cutting one in half to hit 200 would cost more than it buys.
- `lib/trading/service.ts` is a 26-line barrel over `service-dashboard.ts`, `service-gates.ts`, `service-journal.ts`, `service-analytics.ts`, `service-backtests.ts` and `service-commands.ts` (was 890 lines). Every route keeps importing from `service`.
- `lib/trading/intraday-engine.ts` is the 5m tick and nothing else (125 lines, was 577). Stages: `intraday-advance.ts`, `intraday-scan.ts`, `intraday-rate.ts`, with `intraday-context.ts` (constants, session clock, account, `IntradaySummary`) and `intraday-trade.ts` (one trade: rating snapshot → broker order → first fill) shared with the "search trade" button. The engine re-exports the surface `trade-finder.ts` imports, so no caller's path moved.
- `lib/trading/committee/store.ts` is a 10-line barrel over `store-runs.ts`, `store-reflections.ts` and `store-gate-evals.ts`.
- Agent tools are one module per domain (`lib/agent/tools-*.ts`), composed in `tools.ts`; `withLog` is shared from `tools-log.ts`. Add a new tool to its domain module, not to `tools.ts`.
- [PENDING REFACTOR]: Split `lib/agent/data.ts` (247) and `lib/agent/tools-extra.ts` (206) under 200 lines.
- [PENDING REFACTOR]: Lift per-card modals from `HabitCard` to screen-level `FormModal` (implemented during instant UX infrastructure).
- [PENDING REFACTOR]: TimelineCanvas clustering still runs on the JS thread (out of NFR-UX-04/05 pass).
- [PENDING REFACTOR]: Split `lib/finance/plan-store.ts` (222) under 200 lines. `plan.ts` is already at 147.
- [PENDING REFACTOR]: Split `lib/trading/committee/store.ts` (322) under 200 lines — committee runs, reflections, gate evals and the dual-track joins are four concerns in one file; `service-*.ts` is the pattern to follow.
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/finance.tsx` (211) under 200 lines.

## Shared primitives (one home each)
- `lib/db/paginate.ts` — `fetchAllRows` / `chunk`. **Any full-table read goes through this.** A `select()` with no bound returns a prefix at PostgREST's row cap, silently: no error, just a wrong answer. It has bitten this repo four times (task sync, calendar sync, committee block attribution, five finance range reads). `range()` also needs an `ORDER BY` — it is not stable without one. Use `chunk` when an `.in(col, ids)` filter fans out to more than one row per id.
- `lib/finance/txn-range.ts` — `monthBounds` / `monthsBounds` / `fetchTransactionsInRange`. Every read of transactions over a date range. Four modules each had their own copy of the December rollover.
- `lib/concurrency.ts` — `mapWithConcurrency`. The bounded pool for anything fan-out; there were three copies plus serial loops that wanted one. Used by `dailyScreen`, intraday data/universe loading, finance ingest notifications.
- `lib/finance/money.ts` — `round2` / `sumAmounts`. Every shekel amount rounds here; nine copies of `round2` lived across the finance modules.
- `lib/trading/round.ts` — `round` / `roundMoney` for stored trading numbers. It replaced eight copies; two of them grew back after the first sweep (`committee/hard-risk.ts`, `position-display.ts`), so check here before writing another.
- `lib/trading/account-equity.ts` — `equityFromTrades` is the only account-equity formula. The tick and the dashboard both call it; each used to have its own.
- `lib/trading/broker/alpaca-data.ts` — `isRegularSessionBar` / `regularSessionWindow`. The US session test for a bar: one `Intl` lookup per UTC day, cached. Never build an `Intl.DateTimeFormat` per bar or per row — at ~150k stock bars per intraday tick it cost ~7s of CPU and ~480MB of native memory, and was what ran the tick out of memory. `stockBars` pages hold ~800 bars whatever `limit` says: batch ≤ 25 intraday symbols, and it throws rather than truncate.
- `lib/trading/intraday-bar-cache.ts` — the bounded per-symbol tail of stock bars that lets a warm intraday tick fetch only new bars (reset daily, capped in symbols and bars).
- `lib/ai-model.ts` — `GEMINI_MODEL_ID`. The model id was written out in the chat agent, the trading agent and the transcriber.
- `lib/api/cron-auth.ts` — scheduler auth. Eight routes each compared the secret with `===`.
- `lib/ops/` — production alerting. `health-rules.ts` (pure: classify Gemini/Alpaca/integration failures, format the digest) + `health-probes.ts` (live probes) back the daily `/api/agent/health` digest; `smoke.ts` backs the post-deploy smoke workflow (`scripts/ops/post-deploy-smoke.ts`); `alert.ts` `sendOpsAlert` is the one way to page the owner (push, WhatsApp fallback). Add a dependency check as a probe there, not a new cron.
- `lib/habit-report-service.ts` — `applyHabitReport` is the only habit write path (REST, agent, legacy). Three copies existed and only one wrote the `habit_reports` history row.

## Notes
- Never mutate cookies inside Server Components (layout). Flash toast is set in Server Actions and read/cleared on the client.
- **iOS home widget:** WidgetKit extension target is added via `@bacons/apple-targets` (`mobile/targets/HomeWidget/`). Main app and widget share snapshot JSON through App Group `group.com.navesarussi.myself` (entitlements wired by `mobile/plugins/with-home-widget.js`). Auth tokens stay in Keychain for App Intents — never in the snapshot file.
