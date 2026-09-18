# iPhone Home Screen Widget — Design

## Goal

Add a **systemLarge** iPhone home-screen widget that mirrors the app’s “what’s urgent” compass: a glanceable dashboard plus fast actions on the most urgent habit and task, and a deep link to categorize the most urgent finance transaction. Upcoming calendar/timeline events appear in the KPI strip.

**SRS mapping (new):** This is a new mobile surface; implementation will add an `FR-WIDGET-*` requirement block to `docs/SSOT/SRS.md`. It extends home dashboard urgency (`FR-HOME-*`), habits reporting, task status advances, and finance categorize deep links — it does not replace those screens.

## Decisions (approved)

| Topic | Choice |
|---|---|
| Platforms | iPhone only (V1) |
| Size | `systemLarge` only (largest home-screen family) |
| UI implementation | Full **Swift / SwiftUI / WidgetKit** — Expo does not render the widget |
| Interaction model (V1) | **B:** habit check-in and task advance run from the widget; finance categorize opens the app |
| Glance content | **A:** one large urgency hero + short KPIs, including next event |
| Extensibility | Snapshot + App Intent pipeline designed so more actions/sizes can be added later |

## Architecture

```
Expo app (JS/TS)                    App Group                 HomeWidget (Swift)
─────────────────                   ─────────                 ──────────────────
After /home + mutations  ──write──► widget-snapshot.json  ◄──read──  SwiftUI Large UI
Deep links for categorize                                    AppIntents (habit / task)
WidgetCenter.reloadTimelines                                 No network in V1
```

### Components

1. **`HomeWidget` app extension** — SwiftUI layouts, RTL/Hebrew copy, empty/error/signed-out states.
2. **`WidgetSnapshot` (Codable JSON)** — small stable contract; not a dump of `HomePayload`.
3. **App Group** — shared container for the snapshot file between the main app and the extension.
4. **App Intents** — V1: habit `check_in`, task status advance (`NEXT_STATUS` semantics). Finance/event open via `myself://` URLs.
5. **Expo config plugin** — injects the widget target into prebuild/EAS (same pattern as existing native plugins such as Apple Pay intent). Do not treat a checked-in `ios/` tree as the source of truth.

### Why full Swift

Maximum control over Large layout, WidgetKit timelines, interactive buttons, and future intents — without a React Native widget UI bridge.

## Snapshot contract

Written by the Expo app after a successful home load and after relevant mutations. Read-only for the widget in V1.

| Field | Purpose |
|---|---|
| `schemaVersion` | Forward-compatible evolution |
| `updatedAt` | ISO timestamp of last write |
| `signedIn` | Gate for signed-out UI |
| `heroCount` | Same urgency count idea as in-app `HomeHero` / `homeHeroCount` |
| `kpis.habitsPending` | Count awaiting report |
| `kpis.tasksDueSoon` | Count in due-soon horizon (aligned with home) |
| `kpis.financeUncategorized` | Uncategorized transaction count |
| `kpis.nextEventLabel` | Short label for next upcoming event, or empty |
| `urgentHabit` | `{ id, title, dueLabel } \| null` |
| `urgentTask` | `{ id, title, status, dueLabel } \| null` |
| `urgentFinance` | `{ id, titleOrAmountLabel } \| null` |
| `nextEvent` | `{ id, title, whenLabel } \| null` |

**Urgency selection** stays in JS, reusing existing home ranking helpers (habit report urgency, `topPriorityTasks`, oldest/first uncategorized finance row, next upcoming timeline/calendar event). Swift does not reimplement ranking.

**Out of snapshot (V1):** goals, trading, full lists, tokens, raw API payloads.

## Large layout (top → bottom)

1. **Hero** — `heroCount` + short title (e.g. urgency today).
2. **KPI row** — four compact cells: habits pending · tasks due soon · to categorize · next event.
3. **Habit card** — title + ✓ check-in (`AppIntent`).
4. **Task card** — title + advance/complete (`AppIntent`).
5. **Finance card** — amount/description; tap → `myself://finance-categorize?id=…`.

Null slots show a short empty line (no layout holes). Background tap / hero may open the app home. Event KPI/card tap opens timeline/event deep link when an id exists.

## Data refresh

1. Write snapshot after successful `/home`, after habit report / task patch / relevant finance changes, and on app backgrounding.
2. Call `WidgetCenter.reloadTimelines` after each write while the app can.
3. Widget timeline policy: scheduled reload roughly every 15–30 minutes when the app is not open (iOS budget — not true real-time).
4. **Widget UI timeline has no network in V1** — the SwiftUI views only read App Group JSON.
5. **App Intents may call the existing HTTPS API** so habit/task actions work without opening the UI. Auth for those calls uses an **App Group Keychain** entry mirrored from the app session (not embedded in the snapshot JSON). If no token is available, the Intent fails closed and may fall back to opening the app.

## Actions (V1)

| UI control | Behavior |
|---|---|
| Habit ✓ | `AppIntent` → existing habit report API (`check_in`) → rewrite snapshot → reload |
| Task advance | `AppIntent` → existing task status patch (`NEXT_STATUS`) → rewrite snapshot → reload |
| Finance card | Deep link to categorize screen (same route pattern as finance tab) |
| Event / empty states | Deep link into app (home / timeline as appropriate) |

Failed intents must not leave an optimistic wrong widget state; keep the previous snapshot. Optional system confirmation from the Intent is nice-to-have, not required for V1.

### Extensibility hooks (build later, design now)

- Shared intent shape: entity `kind` + `id` + snapshot refresh.
- Bump `schemaVersion` when adding fields (e.g. fall button, in-widget categorize).
- Same pipeline supports additional widget families later without redesigning storage.

## Security

- Snapshot JSON: display data only — never access tokens or cookies.
- Session token for Intents: App Group Keychain, written/cleared by the Expo app on login/logout in lockstep with SecureStore.
- Extension network surface is limited to the same owner API routes already used for habit report and task patch.

## Error and edge states

| State | UI |
|---|---|
| `signedIn = false` | “Sign in in the app” + open app |
| No snapshot yet | Quiet loading / waiting until first write |
| Snapshot older than ~6 hours | Show data + subtle “not updated recently” |
| Null urgent row | Per-card empty copy |
| Intent failure | No fake success; previous snapshot remains |

After a successful habit check-in or task advance, the next snapshot must drop that item if it is no longer urgent. Categorized finance and past events disappear on the following refresh.

## Testing

1. **JS unit:** snapshot builder from `HomePayload` (hero, KPIs, urgent picks).
2. **Swift previews:** Large — full, partial, signed-out, stale.
3. **Device manual:** add widget; habit ✓; task advance; finance deep link; refresh after background.
4. **EAS iOS production/TestFlight build** required — widgets do not run in Expo Go.

## Non-goals (V1)

- Android widgets
- Other widget sizes / Lock Screen / StandBy
- In-widget finance categorization
- Arbitrary browsing/API from widget **views** (Intents may call habit/task APIs only)
- Tokens inside snapshot JSON
- Pixel-perfect clone of the full in-app home feed
- Goals / trading on the widget

## Delivery notes

- Native work ships via Expo config plugin + EAS; verify App Group entitlements on both app and extension.
- Deep link scheme already exists (`myself`); register widget entry URLs consistently with Expo Router (`/finance-categorize`, home, timeline as needed).
- After implementation, document `FR-WIDGET-01`… in `docs/SSOT/SRS.md` to match this spec.
