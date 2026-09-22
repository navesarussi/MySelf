# iPhone Home Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `systemLarge` iPhone home-screen widget (full SwiftUI / WidgetKit) that shows home urgency (hero + KPIs including next event) and supports habit check-in + task advance via App Intents, with finance categorize via deep link.

**Architecture:** JS builds a small `WidgetSnapshot` from home data (same urgency helpers as the Home tab). The Expo app writes JSON into an App Group and reloads timelines. A WidgetKit extension renders SwiftUI only from that file. Habit/task App Intents call existing HTTPS APIs using the session token already mirrored into Keychain (extend with App Group access), then patch the shared snapshot and reload. Finance/event taps open `myself://` routes.

**Tech Stack:** Expo SDK 54, Expo config plugins, `@bacons/apple-targets` (widget Xcode target), WidgetKit + SwiftUI + AppIntents, existing `FinanceIngestKeychain` / session sync, shared `lib/*` ranking helpers, `node:test` + `tsx`.

Mapped to SRS: new `FR-WIDGET-01`…`FR-WIDGET-05` (added in final task); extends `FR-HOME-*`, habit report, task status, finance categorize deep links. Refactor logged: No.

## Global Constraints

- Product surface: **Expo iOS only** for this feature. No Android widget. No `/legacy` polish.
- Docs in English; widget user-facing strings may be Hebrew in Swift for V1 (owner-only app, `CFBundleDevelopmentRegion: he`) — keep JS-side labels via existing helpers where possible.
- Max ~200 lines per file; split Swift and TS modules by responsibility.
- Do **not** put tokens in snapshot JSON. Session for Intents: Keychain (extend existing `myself.session_token` sync) with App Group / keychain access group readable by the extension.
- Widget **views** do not network; **App Intents** may call only habit report + task PATCH on `https://myselfapp.xyz/api/v1/...`.
- Widgets require a **native EAS/TestFlight build** — not Expo Go.
- Version bump (`package.json` + `mobile/package.json` + `mobile/app.json`) when shipping to `main` / cutting TestFlight.
- Tests in `lib/__tests__/`; already covered by root `"test": "node --import tsx --test lib/__tests__/*.test.ts"`.
- App Group id (locked): `group.com.navesarussi.myself`
- Snapshot filename (locked): `widget-snapshot.json`
- Widget kind (locked): `HomeWidget`
- `schemaVersion` for V1: `1`

---

## File map

| Path | Responsibility |
|---|---|
| `lib/widget-snapshot.ts` | Types + `buildWidgetSnapshot(...)` pure builder |
| `lib/__tests__/widget-snapshot.test.ts` | Unit tests for builder |
| `lib/widget-next-status.ts` | Shared `NEXT_STATUS` map (extract from mobile task-card for one source of truth) — optional; Swift may duplicate the 5-entry map |
| `app/api/v1/home/route.ts` | Add `urgentFinance` preview row for snapshot |
| `mobile/src/api/resources.ts` | Extend `HomePayload` with `urgentFinance` |
| `mobile/src/native/widget-bridge.ts` | JS ↔ native write snapshot + reload |
| `mobile/native-ios/WidgetSnapshotBridge.swift` | App Group file write + `WidgetCenter.reloadAllTimelines` |
| `mobile/native-ios/WidgetSnapshotBridge.m` | RCT bridge |
| `mobile/native-ios/FinanceIngestKeychain.swift` | Add keychain access group so extension can read session |
| `mobile/plugins/with-apple-pay-intent.js` | Also copy new bridge files (or shared native copy list) |
| `mobile/plugins/with-home-widget.js` | App Group entitlements on main app |
| `mobile/targets/HomeWidget/*` | WidgetKit extension (SwiftUI + Intents + snapshot IO) |
| `mobile/app.json` | Register plugins + apple-targets |
| `mobile/src/widget/sync-widget-snapshot.ts` | Build + write snapshot from `HomePayload` |
| `mobile/app/(tabs)/index.tsx` + query hooks / `_layout` | Call sync after home load, mutations, background |
| `docs/SSOT/SRS.md` | `FR-WIDGET-*` |
| `docs/SSOT/CODE QUALITY.md` | Note native widget target + App Group |

---

### Task 1: Pure snapshot builder + unit tests

**Files:**
- Create: `lib/widget-snapshot.ts`
- Create: `lib/__tests__/widget-snapshot.test.ts`
- Modify: none yet (home API in Task 2)

**Interfaces:**
- Consumes: `homeHeroCount` from `lib/home-kpis.ts`; habit urgency from `lib/habit-stats.ts`; `topPriorityTasks` from `lib/task-priority.ts`; event fields from home payload shape
- Produces: `WidgetSnapshot`, `buildWidgetSnapshot(input): WidgetSnapshot`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/widget-snapshot.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWidgetSnapshot } from "../widget-snapshot";

const baseHabit = {
  id: "h1",
  name: "ספורט",
  kind: "build" as const,
  target_note: null,
  streak_count: 1,
  best_streak: 1,
  total_success_days: 1,
  failure_count: 0,
  last_checked_on: null,
  report_time: "21:00",
  last_reported_at: null,
  archived: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("buildWidgetSnapshot", () => {
  it("sets signedOut snapshot when not signed in", () => {
    const snap = buildWidgetSnapshot({
      signedIn: false,
      now: new Date("2026-09-22T12:00:00"),
      home: null,
    });
    assert.equal(snap.schemaVersion, 1);
    assert.equal(snap.signedIn, false);
    assert.equal(snap.heroCount, 0);
    assert.equal(snap.urgentHabit, null);
  });

  it("picks urgent habit, task, finance, and next event from home", () => {
    const snap = buildWidgetSnapshot({
      signedIn: true,
      now: new Date("2026-09-22T12:00:00"),
      home: {
        habits: [baseHabit],
        relationships: [],
        openTasks: [
          {
            id: "t1",
            title: "חשוב",
            project_id: null,
            priority: "urgent",
            status: "open",
            due_date: "2026-09-22",
            notes: null,
            source: "manual",
            external_id: null,
            external_list_id: null,
            external_meta: null,
            synced_at: null,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
        openTasksCount: 1,
        inProgressTasksCount: 0,
        recentEvents: [
          {
            id: "e1",
            title: "פגישה",
            title_override: null,
            source: "manual",
            event_date: "2026-09-23",
            event_time: "10:00",
            hidden_at: null,
          },
        ],
        eventsMode: "upcoming",
        financeUncategorizedCount: 1,
        urgentFinance: { id: "f1", titleOrAmountLabel: "₪42 · קפה" },
        activeGoals: [],
      },
    });
    assert.equal(snap.signedIn, true);
    assert.ok(snap.heroCount >= 1);
    assert.equal(snap.urgentHabit?.id, "h1");
    assert.equal(snap.urgentTask?.id, "t1");
    assert.equal(snap.urgentFinance?.id, "f1");
    assert.equal(snap.nextEvent?.id, "e1");
    assert.match(snap.kpis.nextEventLabel, /פגישה/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/__tests__/widget-snapshot.test.ts`

Expected: FAIL — `Cannot find module '../widget-snapshot'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/widget-snapshot.ts`:

```ts
import { homeHeroCount } from "./home-kpis";
import {
  dedupeHabits,
  isAwaitingReport,
  isReportDue,
  sortHabitsByReportUrgency,
} from "./habit-stats";
import { filterDueRelationships } from "./relationships-due";
import { topPriorityTasks } from "./task-priority";
import type { Habit, Relationship, Task, TimelineEvent } from "./types";

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;

export type WidgetUrgentHabit = { id: string; title: string; dueLabel: string };
export type WidgetUrgentTask = {
  id: string;
  title: string;
  status: Task["status"];
  dueLabel: string;
};
export type WidgetUrgentFinance = { id: string; titleOrAmountLabel: string };
export type WidgetNextEvent = { id: string; title: string; whenLabel: string };

export type WidgetSnapshot = {
  schemaVersion: number;
  updatedAt: string;
  signedIn: boolean;
  heroCount: number;
  kpis: {
    habitsPending: number;
    tasksDueSoon: number;
    financeUncategorized: number;
    nextEventLabel: string;
  };
  urgentHabit: WidgetUrgentHabit | null;
  urgentTask: WidgetUrgentTask | null;
  urgentFinance: WidgetUrgentFinance | null;
  nextEvent: WidgetNextEvent | null;
};

export type WidgetHomeInput = {
  habits: Habit[];
  relationships: Pick<Relationship, "id" | "name" | "last_contact_date" | "reminder_days">[];
  openTasks: Task[];
  openTasksCount: number;
  inProgressTasksCount: number;
  recentEvents: Array<
    Pick<TimelineEvent, "id" | "title" | "title_override" | "source" | "event_date" | "event_time" | "hidden_at">
  >;
  eventsMode: "upcoming" | "recent";
  financeUncategorizedCount: number;
  urgentFinance: WidgetUrgentFinance | null;
  activeGoals: unknown[];
};

function dueSoonCount(tasks: Task[], now: Date): number {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  return tasks.filter((task) => {
    if (!task.due_date) return false;
    return new Date(task.due_date) <= horizon;
  }).length;
}

function eventTitle(e: WidgetHomeInput["recentEvents"][number]): string {
  return (e.title_override?.trim() || e.title?.trim() || "אירוע");
}

function whenLabel(e: WidgetHomeInput["recentEvents"][number]): string {
  return e.event_time ? `${e.event_date} ${e.event_time}` : e.event_date;
}

export function buildWidgetSnapshot(args: {
  signedIn: boolean;
  now: Date;
  home: WidgetHomeInput | null;
}): WidgetSnapshot {
  const updatedAt = args.now.toISOString();
  if (!args.signedIn || !args.home) {
    return {
      schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
      updatedAt,
      signedIn: false,
      heroCount: 0,
      kpis: {
        habitsPending: 0,
        tasksDueSoon: 0,
        financeUncategorized: 0,
        nextEventLabel: "",
      },
      urgentHabit: null,
      urgentTask: null,
      urgentFinance: null,
      nextEvent: null,
    };
  }

  const home = args.home;
  const today = args.now;
  const uniqueHabits = dedupeHabits(home.habits, today.toISOString().slice(0, 10));
  const pending = sortHabitsByReportUrgency(uniqueHabits, today).filter((h) =>
    isAwaitingReport(h, today)
  );
  const overdue = uniqueHabits.filter((h) => isReportDue(h, today));
  const dueRelationships = filterDueRelationships(home.relationships as Relationship[], today);
  const tasksDueSoon = dueSoonCount(home.openTasks, today);
  const topTask = topPriorityTasks(home.openTasks, 1)[0] ?? null;
  const nextEv =
    home.eventsMode === "upcoming" && home.recentEvents[0] ? home.recentEvents[0] : null;
  const urgentHabit = pending[0]
    ? { id: pending[0].id, title: pending[0].name, dueLabel: pending[0].report_time || "" }
    : null;
  const urgentTask = topTask
    ? {
        id: topTask.id,
        title: topTask.title,
        status: topTask.status,
        dueLabel: topTask.due_date || "",
      }
    : null;
  const nextEvent = nextEv
    ? {
        id: nextEv.id,
        title: eventTitle(nextEv),
        whenLabel: whenLabel(nextEv),
      }
    : null;

  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    updatedAt,
    signedIn: true,
    heroCount: homeHeroCount({
      habitsOverdue: overdue.length,
      dueRelationships: dueRelationships.length,
      tasksDueSoon,
      financeUncategorized: home.financeUncategorizedCount,
    }),
    kpis: {
      habitsPending: pending.length,
      tasksDueSoon,
      financeUncategorized: home.financeUncategorizedCount,
      nextEventLabel: nextEvent ? nextEvent.title : "",
    },
    urgentHabit,
    urgentTask,
    urgentFinance: home.urgentFinance,
    nextEvent,
  };
}
```

Adjust imports if `isReportDue` / `filterDueRelationships` signatures differ — match existing call sites in `mobile/app/(tabs)/index.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test lib/__tests__/widget-snapshot.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/widget-snapshot.ts lib/__tests__/widget-snapshot.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): add pure WidgetSnapshot builder

Encode home urgency selection for the iPhone widget contract.
EOF
)"
```

---

### Task 2: Home API `urgentFinance` preview

**Files:**
- Modify: `app/api/v1/home/route.ts`
- Modify: `mobile/src/api/resources.ts` (`HomePayload`)
- Test: extend `lib/__tests__/widget-snapshot.test.ts` already assumes the field; optionally add a small pure formatter test if you extract label helper

**Interfaces:**
- Consumes: `finance_transactions` where `needs_categorization = true`
- Produces: `urgentFinance: { id: string; titleOrAmountLabel: string } | null` on `/home` JSON

- [ ] **Step 1: Write failing assertion on payload shape (document expected query)**

Add to `lib/widget-snapshot.ts` (or keep inline in route):

```ts
export function formatUrgentFinanceLabel(row: {
  amount: number;
  merchant: string | null;
  description: string | null;
}): string {
  const name = (row.merchant || row.description || "תנועה").trim();
  const amount = Math.round(row.amount);
  return `₪${amount} · ${name}`;
}
```

Add test in `lib/__tests__/widget-snapshot.test.ts`:

```ts
import { formatUrgentFinanceLabel } from "../widget-snapshot";

it("formats finance label", () => {
  assert.equal(
    formatUrgentFinanceLabel({ amount: 42.2, merchant: "קפה", description: null }),
    "₪42 · קפה"
  );
});
```

- [ ] **Step 2: Run test — fail until export exists, then implement formatter + home query**

In `app/api/v1/home/route.ts`, add a parallel query (alongside the count):

```ts
supabase
  .from("finance_transactions")
  .select("id, amount, merchant, description")
  .eq("needs_categorization", true)
  .order("txn_date", { ascending: true })
  .order("created_at", { ascending: true })
  .limit(1)
```

Map first row through `formatUrgentFinanceLabel` into response field `urgentFinance`. Include in `collectFailures`. Update `HomePayload` in `mobile/src/api/resources.ts`:

```ts
urgentFinance: { id: string; titleOrAmountLabel: string } | null;
```

- [ ] **Step 3: Run unit tests**

Run: `node --import tsx --test lib/__tests__/widget-snapshot.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/home/route.ts mobile/src/api/resources.ts lib/widget-snapshot.ts lib/__tests__/widget-snapshot.test.ts
git commit -m "$(cat <<'EOF'
feat(home): expose urgentFinance preview for widget snapshot

Give the mobile client the oldest uncategorized transaction id+label.
EOF
)"
```

---

### Task 3: Native App Group bridge (write snapshot + reload)

**Files:**
- Create: `mobile/native-ios/WidgetSnapshotBridge.swift`
- Create: `mobile/native-ios/WidgetSnapshotBridge.m`
- Create: `mobile/src/native/widget-bridge.ts`
- Modify: `mobile/plugins/with-apple-pay-intent.js` — add the two new files to `SOURCE_FILES`
- Modify: `mobile/native-ios/FinanceIngestKeychain.swift` — set `kSecAttrAccessGroup` for extension reads

**Interfaces:**
- Consumes: JSON string from JS
- Produces: `NativeModules.WidgetSnapshotBridge.writeSnapshot(json: string): Promise<void>`, `reloadTimelines(): Promise<void>`

- [ ] **Step 1: Implement Swift bridge**

`WidgetSnapshotBridge.swift`:

```swift
import Foundation
import WidgetKit
import React

@objc(WidgetSnapshotBridge)
class WidgetSnapshotBridge: NSObject {
  static let appGroupId = "group.com.navesarussi.myself"
  static let fileName = "widget-snapshot.json"

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func writeSnapshot(_ json: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId) else {
      rejecter("no_app_group", "App Group container missing", nil)
      return
    }
    let url = dir.appendingPathComponent(Self.fileName)
    do {
      try json.data(using: .utf8)?.write(to: url, options: .atomic)
      resolver(nil)
    } catch {
      rejecter("write_failed", error.localizedDescription, error)
    }
  }

  @objc func reloadTimelines(_ resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolver(nil)
  }
}
```

`WidgetSnapshotBridge.m`:

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetSnapshotBridge, NSObject)
RCT_EXTERN_METHOD(writeSnapshot:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(reloadTimelines:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
```

`mobile/src/native/widget-bridge.ts`:

```ts
import { NativeModules, Platform } from "react-native";

type WidgetSnapshotBridgeModule = {
  writeSnapshot: (json: string) => Promise<void>;
  reloadTimelines: () => Promise<void>;
};

const bridge: WidgetSnapshotBridgeModule | undefined =
  Platform.OS === "ios" ? NativeModules.WidgetSnapshotBridge : undefined;

export async function writeWidgetSnapshotJson(json: string): Promise<void> {
  if (!bridge) return;
  await bridge.writeSnapshot(json);
}

export async function reloadHomeWidgetTimelines(): Promise<void> {
  if (!bridge) return;
  await bridge.reloadTimelines();
}
```

- [ ] **Step 2: Keychain access group for extension**

In `FinanceIngestKeychain.swift`, add to every SecItem query/add dictionary:

```swift
static let accessGroup = "HVW3H3DLRB.com.navesarussi.myself" // Apple Team ID + bundle — verify against Xcode/EAS entitlements

// in set/get:
kSecAttrAccessGroup as String: accessGroup,
```

Prefer reading Team ID from entitlements at build time if already patterned elsewhere; otherwise lock the known team id from `eas.json` (`HVW3H3DLRB`). Both app and widget targets must list the same Keychain Access Group / App Group in entitlements (Task 4).

- [ ] **Step 3: Register bridge files in `with-apple-pay-intent.js` `SOURCE_FILES` array**

- [ ] **Step 4: Commit**

```bash
git add mobile/native-ios/WidgetSnapshotBridge.swift mobile/native-ios/WidgetSnapshotBridge.m mobile/src/native/widget-bridge.ts mobile/plugins/with-apple-pay-intent.js mobile/native-ios/FinanceIngestKeychain.swift
git commit -m "$(cat <<'EOF'
feat(ios): App Group widget snapshot bridge and shared keychain access

Let the Expo app write widget JSON and share the session token with Intents.
EOF
)"
```

---

### Task 4: Expo widget target + App Group entitlements

**Files:**
- Create: `mobile/plugins/with-home-widget.js`
- Create: `mobile/targets/HomeWidget/expo-target.config.js` (or `.json` per `@bacons/apple-targets` docs for installed version)
- Create: Swift sources under `mobile/targets/HomeWidget/` (scaffold in this task; UI filled in Task 5)
- Modify: `mobile/app.json` — plugins + entitlements
- Modify: `mobile/package.json` — add `@bacons/apple-targets` dependency

**Interfaces:**
- Produces: Xcode Widget Extension target `HomeWidget` with App Group `group.com.navesarussi.myself`, kind `HomeWidget`

- [ ] **Step 1: Install apple-targets**

From `mobile/`:

```bash
npx expo install @bacons/apple-targets
```

- [ ] **Step 2: Config plugin for main-app App Group**

`mobile/plugins/with-home-widget.js`:

```js
const { withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

const APP_GROUP = "group.com.navesarussi.myself";

function withHomeWidget(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    cfg.modResults["com.apple.security.application-groups"] = groups;
    const keychain = cfg.modResults["keychain-access-groups"] || [];
    const kg = "$(AppIdentifierPrefix)com.navesarussi.myself";
    if (!keychain.includes(kg)) keychain.push(kg);
    cfg.modResults["keychain-access-groups"] = keychain;
    return cfg;
  });
  return config;
}

module.exports = withHomeWidget;
```

Align `FinanceIngestKeychain.accessGroup` with `$(AppIdentifierPrefix)com.navesarussi.myself` resolved value (TeamID + id). If Keychain Sharing uses AppIdentifierPrefix, prefer that string form in Swift via a single constant matching entitlements.

- [ ] **Step 3: Scaffold target folder**

Create `mobile/targets/HomeWidget/expo-target.config.js` per package README (bundle id `com.navesarussi.myself.homewidget`, type `widget`, deployment iOS 17+ for interactive widgets / App Intents buttons — use **iOS 17** minimum for the widget target).

Minimal `HomeWidget.swift` stub that compiles:

```swift
import WidgetKit
import SwiftUI

@main
struct HomeWidgetBundle: WidgetBundle {
  var body: some Widget {
    HomeWidget()
  }
}

struct HomeWidget: Widget {
  let kind = "HomeWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: HomeTimelineProvider()) { entry in
      HomeWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("MySelf")
    .description("דשבורד דחיפות")
    .supportedFamilies([.systemLarge])
  }
}
```

(Details of `HomeTimelineProvider` / views in Task 5.)

- [ ] **Step 4: Register plugins in `mobile/app.json`**

Add `./plugins/with-home-widget` and `@bacons/apple-targets` to `expo.plugins` (order: entitlements plugin before/with apple-targets as docs require).

- [ ] **Step 5: Prebuild smoke (local)**

```bash
cd mobile && npx expo prebuild --platform ios --no-install
```

Expected: `ios/` contains HomeWidget extension target; main entitlements include App Group.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/plugins/with-home-widget.js mobile/targets/HomeWidget
git commit -m "$(cat <<'EOF'
feat(ios): scaffold HomeWidget target and App Group entitlements

Prepare WidgetKit extension packaging for EAS builds.
EOF
)"
```

---

### Task 5: SwiftUI Large UI + snapshot reader

**Files:**
- Create/Modify: `mobile/targets/HomeWidget/WidgetSnapshot.swift` (Codable mirror of TS contract)
- Create/Modify: `mobile/targets/HomeWidget/HomeTimelineProvider.swift`
- Create/Modify: `mobile/targets/HomeWidget/HomeWidgetEntryView.swift`
- Create/Modify: `mobile/targets/HomeWidget/HomeWidget.swift`

**Interfaces:**
- Consumes: App Group `widget-snapshot.json`
- Produces: `systemLarge` UI per design spec

- [ ] **Step 1: Codable snapshot + store**

```swift
struct WidgetSnapshot: Codable {
  var schemaVersion: Int
  var updatedAt: String
  var signedIn: Bool
  var heroCount: Int
  var kpis: Kpis
  var urgentHabit: UrgentHabit?
  var urgentTask: UrgentTask?
  var urgentFinance: UrgentFinance?
  var nextEvent: NextEvent?

  struct Kpis: Codable {
    var habitsPending: Int
    var tasksDueSoon: Int
    var financeUncategorized: Int
    var nextEventLabel: String
  }
  struct UrgentHabit: Codable { var id: String; var title: String; var dueLabel: String }
  struct UrgentTask: Codable { var id: String; var title: String; var status: String; var dueLabel: String }
  struct UrgentFinance: Codable { var id: String; var titleOrAmountLabel: String }
  struct NextEvent: Codable { var id: String; var title: String; var whenLabel: String }
}

enum WidgetSnapshotStore {
  static let appGroupId = "group.com.navesarussi.myself"
  static let fileName = "widget-snapshot.json"

  static func load() -> WidgetSnapshot? {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return nil }
    let url = dir.appendingPathComponent(fileName)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  static func save(_ snap: WidgetSnapshot) {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return }
    let url = dir.appendingPathComponent(fileName)
    guard let data = try? JSONEncoder().encode(snap) else { return }
    try? data.write(to: url, options: .atomic)
  }
}
```

- [ ] **Step 2: Timeline provider**

Policy: one entry now; `policy: .after(Date().addingTimeInterval(20 * 60))` (~20 min).

Entry holds `snapshot: WidgetSnapshot?` and `date: Date`.

- [ ] **Step 3: Entry view layout (RTL)**

Top → bottom:
1. Hero number `heroCount` + title `דחוף היום`
2. Four KPI cells: הרגלים / משימות / לסיווג / אירוע
3. Habit row + `Button(intent: HabitCheckInIntent(...))` when id present
4. Task row + `Button(intent: TaskAdvanceIntent(...))`
5. Finance row as `Link` to `myself://finance-categorize?id=...`
6. If `!signedIn` → single “התחבר באפליקציה” + link `myself://`
7. If `updatedAt` older than 6 hours → subtle `לא עודכן לאחרונה`
8. Empty rows: `אין הרגל דחוף` / `אין משימה דחופה` / `אין תנועה לסיווג`

Use `.environment(\.layoutDirection, .rightToLeft)`. Match app dark tones (`#0b0c10` background, `#15171d` cards, accent `#7dd3c0`).

- [ ] **Step 4: Xcode previews** for full / partial / signed-out / stale (static `WidgetSnapshot` fixtures).

- [ ] **Step 5: Commit**

```bash
git add mobile/targets/HomeWidget
git commit -m "$(cat <<'EOF'
feat(ios): render systemLarge HomeWidget from App Group snapshot

SwiftUI dashboard with KPI strip and deep-link finance row.
EOF
)"
```

---

### Task 6: App Intents — habit check-in + task advance

**Files:**
- Create: `mobile/targets/HomeWidget/HabitCheckInIntent.swift`
- Create: `mobile/targets/HomeWidget/TaskAdvanceIntent.swift`
- Create: `mobile/targets/HomeWidget/WidgetApiClient.swift`
- Modify: widget views to wire `Button(intent:)`

**Interfaces:**
- Consumes: Keychain session via `FinanceIngestKeychain.resolveAuthToken()` (session key) — **copy or share** the Keychain helper into the widget target (duplicate small file in target if targets cannot link main-app Swift; prefer a tiny shared Swift file listed in both targets via apple-targets `frameworks`/`shared` if supported, else duplicate `WidgetKeychain.swift` in the extension that reads the same service/account/access group)
- Produces: successful API call + local snapshot patch clearing that urgent item + `WidgetCenter.reloadTimelines`

- [ ] **Step 1: API client**

```swift
enum WidgetApiClient {
  static let base = URL(string: "https://myselfapp.xyz/api/v1")!

  static func authorizedRequest(path: String, method: String, json: [String: Any]?) async throws {
    guard let token = WidgetKeychain.sessionToken() else { throw WidgetApiError.unauthorized }
    var req = URLRequest(url: base.appendingPathComponent(path))
    req.httpMethod = method
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let json { req.httpBody = try JSONSerialization.data(withJSONObject: json) }
    let (_, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
      throw WidgetApiError.failed
    }
  }
}
```

Habit: `POST habits/{id}/report` body `["type": "check_in"]`  
Task: `PATCH tasks/{id}` body `["status": nextStatus]`

Next status map (duplicate of JS):

```swift
func nextStatus(_ status: String) -> String {
  switch status {
  case "open": return "in_progress"
  case "in_progress": return "stuck"
  case "stuck": return "review"
  case "review": return "done"
  default: return "open"
  }
}
```

- [ ] **Step 2: Intents**

```swift
struct HabitCheckInIntent: AppIntent {
  static var title: LocalizedStringResource = "דיווח הרגל"
  @Parameter(title: "Habit ID") var habitId: String
  func perform() async throws -> some IntentResult {
    try await WidgetApiClient.authorizedRequest(path: "habits/\(habitId)/report", method: "POST", json: ["type": "check_in"])
    if var snap = WidgetSnapshotStore.load() {
      if snap.urgentHabit?.id == habitId { snap.urgentHabit = nil }
      snap.kpis.habitsPending = max(0, snap.kpis.habitsPending - 1)
      snap.heroCount = max(0, snap.heroCount - 1)
      snap.updatedAt = ISO8601DateFormatter().string(from: Date())
      WidgetSnapshotStore.save(snap)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
    return .result()
  }
}
```

Mirror for `TaskAdvanceIntent` with `taskId` + `status` parameters; on success clear `urgentTask` when ids match.

On missing token: throw; do **not** mutate snapshot (fail closed). Optional: `openAppWhenRun = true` only as fallback — default `false` per design B.

- [ ] **Step 3: Commit**

```bash
git add mobile/targets/HomeWidget
git commit -m "$(cat <<'EOF'
feat(ios): widget App Intents for habit check-in and task advance

Call existing APIs with shared Keychain session and refresh snapshot.
EOF
)"
```

---

### Task 7: Wire Expo app to write + reload snapshot

**Files:**
- Create: `mobile/src/widget/sync-widget-snapshot.ts`
- Modify: `mobile/app/(tabs)/index.tsx` (after successful home data)
- Modify: `mobile/app/_layout.tsx` (AppState background) and/or session sign-in/out
- Modify: mutation success paths that already invalidate home (habit report / task patch / finance categorize) — call sync after home cache update

**Interfaces:**
- Consumes: `buildWidgetSnapshot`, `writeWidgetSnapshotJson`, `reloadHomeWidgetTimelines`, react-query `queryKeys.home`
- Produces: best-effort side effect (never block UI)

- [ ] **Step 1: Sync helper**

```ts
import { buildWidgetSnapshot, type WidgetHomeInput } from "@/lib/widget-snapshot";
import type { HomePayload } from "../api/resources";
import { writeWidgetSnapshotJson, reloadHomeWidgetTimelines } from "../native/widget-bridge";

export async function syncWidgetSnapshot(args: {
  signedIn: boolean;
  home: HomePayload | null;
}): Promise<void> {
  const homeInput: WidgetHomeInput | null = args.home
    ? {
        habits: args.home.habits,
        relationships: args.home.relationships,
        openTasks: args.home.openTasks,
        openTasksCount: args.home.openTasksCount,
        inProgressTasksCount: args.home.inProgressTasksCount,
        recentEvents: args.home.recentEvents,
        eventsMode: args.home.eventsMode,
        financeUncategorizedCount: args.home.financeUncategorizedCount,
        urgentFinance: args.home.urgentFinance ?? null,
        activeGoals: args.home.activeGoals,
      }
    : null;
  const snap = buildWidgetSnapshot({
    signedIn: args.signedIn,
    now: new Date(),
    home: homeInput,
  });
  await writeWidgetSnapshotJson(JSON.stringify(snap));
  await reloadHomeWidgetTimelines();
}
```

- [ ] **Step 2: Call sites**

1. When `useApiQuery(queryKeys.home)` returns data on Home tab — `void syncWidgetSnapshot({ signedIn: !!token, home: data })`.
2. `AppState` → `background` / `inactive`: read `queryClient.getQueryData(queryKeys.home)` and sync.
3. `signOut`: sync with `signedIn: false, home: null`.
4. After successful habit/task/finance mutations that patch home cache: sync with updated cache.

Keep calls fire-and-forget with `.catch(() => {})`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` from repo root

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add mobile/src/widget/sync-widget-snapshot.ts mobile/app/(tabs)/index.tsx mobile/app/_layout.tsx mobile/src/session.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): sync WidgetSnapshot to App Group on home updates

Keep the iPhone widget fresh after load, mutations, and backgrounding.
EOF
)"
```

---

### Task 8: SRS + CODE QUALITY + version bump for TestFlight

**Files:**
- Modify: `docs/SSOT/SRS.md` — add `FR-WIDGET-01`…`05`
- Modify: `docs/SSOT/CODE QUALITY.md` — short note on widget target / App Group
- Modify: root `package.json`, `mobile/package.json`, `mobile/app.json` versions (patch or minor — **minor** for new surface)

- [ ] **Step 1: SRS block**

```md
### FR-WIDGET-01
iPhone home screen supports a systemLarge WidgetKit widget showing home urgency hero count and short KPIs (habits pending, tasks due soon, finance uncategorized, next event).

### FR-WIDGET-02
Widget data comes from an App Group JSON snapshot written by the Expo app after home load/mutations; ranking stays in JS using the same helpers as Home.

### FR-WIDGET-03
V1 interactions: habit check-in and task status advance via App Intents against existing APIs; finance categorize opens the app via `myself://finance-categorize?id=`.

### FR-WIDGET-04
Signed-out and empty-urgency states are explicit; failed Intents do not optimistically clear snapshot rows.

### FR-WIDGET-05
Android widgets, other sizes, Lock Screen/StandBy, and in-widget finance categorization are out of scope for V1.
```

- [ ] **Step 2: Bump versions** to next minor (e.g. `1.27.0` if current is `1.26.0` — read actual values at commit time).

- [ ] **Step 3: Commit + push `main`**

```bash
git add docs/SSOT/SRS.md docs/SSOT/CODE\ QUALITY.md package.json mobile/package.json mobile/app.json
git commit -m "$(cat <<'EOF'
docs+chore: FR-WIDGET requirements and version bump for widget TestFlight

EOF
)"
git push origin main
```

- [ ] **Step 4: Manual TestFlight checklist (human)**

1. EAS production iOS build + install
2. Long-press home → Add Widget → MySelf Large
3. Open app, load Home → widget fills
4. Habit ✓ from widget → streak updates in app
5. Task advance from widget → status updates
6. Finance row → opens categorize
7. Sign out → widget shows sign-in state

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| systemLarge only, iPhone | 4, 5 |
| Full Swift UI | 5 |
| Hero + KPIs + next event | 1, 5 |
| Habit ✓ / task advance Intents | 6 |
| Finance deep link | 5 |
| Snapshot contract + schemaVersion | 1 |
| App Group write + reload | 3, 7 |
| Keychain for Intents, no token in JSON | 3, 6 |
| ~20 min timeline / stale 6h UI | 5 |
| Extensible intents / schema | 1, 6 |
| Unit tests for builder | 1 |
| EAS / not Expo Go | 8 |
| SRS FR-WIDGET | 8 |
| urgent finance id for deep link | 2 |

No placeholder TBDs remain. Types `WidgetSnapshot` / field names are consistent across TS and Swift tasks.
