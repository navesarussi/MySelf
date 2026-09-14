# Unified Dashboard + Locale-Aware UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home look and behave like the Finance and Trading dashboards, and make every Expo screen share the same locale-aware layout (Hebrew start-edge / English start-edge) so controls such as the task Done checkbox sit on the reading-start side.

**Architecture:** Extract a tested, platform-aware layout engine (`lib/layout-dir.ts`) so web `document.dir` and native `I18nManager` never double-flip a row. Lift the Finance/Trading visual primitives (hero metric, KPI grid, hub links, start-filling progress, LTR time nav) into shared UI. Restyle Home as a data dashboard that reuses those primitives and adds lean finance/trading snapshots. Sweep hardcoded copy and physical `left`/`row` usage. Do not add Home module-shortcut cards (FR-HOME-01).

**Tech Stack:** Expo / React Native (mobile + web SPA), shared `lib/i18n`, `lib/layout-dir`, existing `palette` tokens (`components/ui/colors.ts`), `node:test` + `tsx`. No new native modules, no new chart libraries, no Google Fonts native rebuild.

Mapped to SRS: FR-HOME-01, FR-HOME-02, FR-HOME-03 (updated), FR-HOME-04 (new), FR-FIN-05, FR-I18N-01 (new), FR-UI-01 (new), FR-NAV-01, FR-TASK-01, FR-TOAST-01, NFR-UX-01…05. Refactor logged: Yes (`mobile/app/(tabs)/index.tsx` split; shared dashboard primitives).

## Global Constraints

- Product surface: **Expo app only** (`mobile/` + shared `lib/**` + `app/api/**`). Do not polish `/legacy`.
- Docs in English; all user-facing copy via `lib/i18n/messages.ts` (he + en). No hardcoded Hebrew or English in components.
- Max ~200 lines per file; split Home and do not grow `ui.tsx` (already ~438 lines) — new primitives go in new files.
- Keep existing color tokens (`palette.dark` / `palette.light` in `components/ui/colors.ts`). Do **not** switch to a blue/monochrome marketing palette.
- Keep native `I18nManager.allowRTL(false)` / `forceRTL(false)` (reload-stuck). Locale mirroring stays in `useLayoutDir`. Web **must** keep `document.documentElement.dir` + `lang` for a11y.
- FR-NAV-01: bottom bar stays forced LTR with Home pinned to the visual right. Do not RTL-reverse the tab bar.
- FR-HOME-01: Home is a data dashboard. No FinanceHub-style shortcut tiles to other modules. KPI tiles that navigate to the matching tab are allowed (already the pattern).
- Charts, price axes, month/time pagers, and the tab bar are **time/LTR exceptions**. Everything else uses `layout.row`.
- Ionicons only (no emoji-as-icon). `cursor-pointer` is web-only; native uses Pressable. Hover = opacity/color, never layout-shifting scale.
- Version bump (`package.json` + `mobile/package.json` + `mobile/app.json`) only when shipping to main.
- Tests live in `lib/__tests__/` and must be added to the `test` script in root `package.json`.

---

## Current-state findings (do not skip)

These are the bugs and mismatches this plan exists to fix.

### 1. Task checkbox is on the wrong side (the reported example)

`TaskCard` puts the checkbox as the **first** child of `Row`, which uses `useLayoutDir().row`.

`useLayoutDir` assumes native LTR and applies `flexDirection: "row-reverse"` for Hebrew so the first child lands on the physical right (start).

On **web**, `I18nProvider` also sets `document.documentElement.dir = "rtl"`. CSS `flex-direction: row` already follows writing mode, so `row-reverse` **double-flips**. First child (checkbox) lands on the **left** in Hebrew.

On **native**, only `row-reverse` applies, so the checkbox is on the right (correct for Hebrew).

Fix the engine, not one card. After the engine is correct, first-in-`Row` is always start-edge on both platforms.

### 2. Home does not match Finance / Trading

| Surface | Chrome | Metrics | Hero | Density |
|---|---|---|---|---|
| Finance | `ScreenList` title 22/700 + muted subtitle | Hub tiles + weekly remaining 20px + progress | Centered 32px tabular net | Readable labels |
| Trading | `Screen` title + subtitle | `KpiGrid` 30% tiles, value 17/800, hint 10px | Phase badges + alerts | Same cards |
| Home | No screen title; large quote card | `HomeStatsGrid` 9px labels, `minHeight: 56` | None | Long list of mixed cards + duplicate footer links |

Home already satisfies FR-HOME-02 data (habits pending, top 10 tasks, due relationships, events). The gap is **visual language + missing money/trading numbers**.

### 3. Layout is not generic

Many stacks bypass `useLayoutDir().row` and hardcode `flexDirection: "row"`: `FinanceHubLinks`, `TradingHubLinks`, `KpiGrid`, `HomeStatsGrid`, week strip, categorize chips, wealth rows. Those look OK on web RTL (CSS dir) and **wrong on native Hebrew** (physical LTR).

### 4. Copy ignores locale

- `mobile/src/components/finance/txn-row.tsx` hardcodes `קבועה` / `חיסכון` / `רגילה` even though `finance.expenseType*` keys exist.
- `month-nav.tsx` accessibility labels are hardcoded Hebrew.
- Trading UI: `⚠ injection`, `agent:`, `BASE`, `trail`, `params ${version}`.
- `FinanceHero` always formats with `he-IL`.
- Home i18n still uses `←` arrows (`home.fullList`, `home.toTimeline`, …) which point the wrong way in English and are redundant because section titles already navigate.

### 5. Chat bubbles are the inverse of the checkbox bug

`agent-chat.tsx` / `trading-chat.tsx` use `alignSelf: user ? "flex-end" : "flex-start"` (physical, because native is LTR). On native Hebrew, user bubbles sit on the right (English convention). On web RTL they follow CSS and sit on the end edge. Need `layout.alignEnd` / `layout.alignStart`.

### 6. Time controls were mirrored as if they were text

`FinanceMonthNav` uses `layout.row`, so in Hebrew “previous” (chevron-back, points left) jumps to the right. Time pagers must stay LTR: previous = left, next = right, icons unmirrored.

### 7. File size

`mobile/app/(tabs)/index.tsx` is ~545 lines (CODE QUALITY pending refactor). Restyle **must** split it.

---

## Design system (locked)

Keep the existing MySelf palette. Unify **structure**, not brand colors.

```
bg        dark #0b0c10 / light #f7f6f3
surface   dark #15171d / light #ffffff
border    dark #262a33 / light #e6e3dc
ink       dark #f3f4f6 / light #1d1f24
muted     dark #9aa0ab / light #6b7178
accent    dark #7dd3c0 / light #1f7a68
accent2   dark #e8b86d / light #b5791f
warn      dark #e2725b / light #b23e28
good      dark #7dd3a7 / light #1f7a4a

radius 12 / radiusSm 8 / pad 12 / padLg 16
title 22/700  subtitle 13 muted  body 14  label 12  hint 10–11
KPI value 17/800   Hero value 32/800 tabular-nums
transitions 150–200ms opacity/color only
```

**Shared dashboard skeleton** (Home, Finance, Trading):

1. Screen title + one-line subtitle (no quote-as-hero).
2. Optional status/alert row (Trading kill-switch / Finance uncategorized).
3. Optional hub links **only on module hubs** (Finance, Trading) — not Home.
4. Hero metric (one primary number, start-aligned except Finance net which stays centered as it is today).
5. `KpiGrid` (flexBasis 30%, minWidth 100).
6. SectionTitle → entity rows/cards.
7. EmptyState / ErrorNote / Loading unchanged in role.

**RTL rules**

| Element | Behavior |
|---|---|
| Checkbox / radio | First child of `layout.row` = start edge (right in he, left in en) |
| Back / next **content** chevrons | Mirror with `layout.chevronBack` / `layout.chevronForward` |
| Month / time pager | Forced LTR; chevron-back left = earlier |
| Progress fill | Grows from start (`layout.rtl` → `alignSelf: "flex-end"` on native) |
| User chat bubble | `layout.alignEnd` |
| Other chat bubble | `layout.alignStart` |
| Tab bar | Unchanged forced LTR (FR-NAV-01) |
| Numbers, tickers, ISO dates | Isolate LTR (`layout.textLtr`) |
| Primary form action | First in `Row` so it sits on start after engine fix |

---

## File map

| File | Responsibility |
|---|---|
| `docs/SSOT/SRS.md` | FR-I18N-01, FR-UI-01, FR-HOME-03 rewrite, FR-HOME-04 |
| `docs/SSOT/CODE QUALITY.md` | Mark index.tsx split in progress; add layout-dir note |
| `lib/layout-dir.ts` | Pure layout engine (tested) |
| `lib/__tests__/layout-dir.test.ts` | Double-flip, checkbox start, chat align, time row |
| `mobile/src/layout-dir.ts` | RN hook wrapping the pure engine |
| `lib/home-kpis.ts` | Pure Home KPI + hero count builder |
| `lib/__tests__/home-kpis.test.ts` | KPI list + hero count |
| `lib/home-snapshots.ts` | Pure month-key + snapshot shaping (no I/O) |
| `lib/__tests__/home-snapshots.test.ts` | Snapshot shaping |
| `app/api/v1/home/route.ts` | Add lean `finance` + `trading` snapshot fields |
| `mobile/src/api/resources.ts` | `HomePayload` snapshot types |
| `lib/__tests__/query-patch.test.ts` | Extend mock HomePayload |
| `mobile/src/components/ui/kpi-grid.tsx` | Shared KPI grid (moved from trading) |
| `mobile/src/components/ui/hub-links.tsx` | Shared hub tiles |
| `mobile/src/components/ui/hero-metric.tsx` | Shared hero number |
| `mobile/src/components/ui/progress-bar.tsx` | Start-edge fill |
| `mobile/src/components/ui/time-nav.tsx` | LTR pager replacing FinanceMonthNav |
| `mobile/src/components/trading/charts.tsx` | Re-export / use shared KpiGrid |
| `mobile/src/components/finance/finance-hub-links.tsx` | Thin wrapper over HubLinks |
| `mobile/src/components/trading/blocks.tsx` | Thin wrapper over HubLinks |
| `mobile/src/components/home/home-hero.tsx` | Today-needs-you hero |
| `mobile/src/components/home/home-kpis.tsx` | Home KPI wiring |
| `mobile/src/components/home/home-feed.tsx` | Habit/goal/task/rel/event/library sections |
| `mobile/app/(tabs)/index.tsx` | Data + mutations only |
| `mobile/src/components/task-card.tsx` | Checkbox stays first in Row (engine fix is enough) |
| `mobile/src/components/home-stats-grid.tsx` | Delete after Home uses KpiGrid |
| `lib/home-stats-grid.ts` + test | Delete after replacement |
| `lib/i18n/messages.ts` | New keys; strip `←`; expense types; trading labels |
| Remaining screens listed in Task 11 | `layout.row` + i18n + shared primitives |
| `package.json` | Register new tests |

---

### Task 1: SRS + quality notes

**Files:**
- Modify: `docs/SSOT/SRS.md`
- Modify: `docs/SSOT/CODE QUALITY.md`

**Interfaces:**
- Produces: requirement IDs later tasks map to (`FR-I18N-01`, `FR-UI-01`, `FR-HOME-04`).

- [ ] **Step 1: Append these requirements to `docs/SSOT/SRS.md` after FR-HOME-03**

Replace FR-HOME-03 with:

```markdown
### FR-HOME-03
Home stats use the shared KPI grid (same tile anatomy as Trading: muted label, 17/800 value, optional hint). At least 8 metrics. Labels must be readable (no 9px-only tiles).

### FR-HOME-04
Home KPI grid always includes a current-month finance net tile (links to `/finance`) and a trading equity/phase tile (links to `/trading`). The uncategorized-finance tile from FR-FIN-05 remains when `financeUncategorizedCount > 0`.

### FR-I18N-01
The in-app locale (`he` | `en`, Settings) drives both copy and layout. Start-edge controls (task Done checkbox, section add buttons, primary form actions) sit on the inline-start side: physical right in Hebrew, physical left in English, on native and web. User-facing strings live in `lib/i18n/messages.ts`. Time series, month pagers, and the bottom tab bar are explicit LTR exceptions (FR-NAV-01).

### FR-UI-01
Home, Finance, and Trading share dashboard primitives: screen title/subtitle, hero metric, KPI grid, hub links (module hubs only), start-filling progress, locale-aware rows. Entity list cards (tasks, habits, relationships, goals) use the same Card + start-aligned Row pattern.
```

Also extend FR-NAV-01’s nav list to include כסף and מסחר (already in the app; SRS is stale).

- [ ] **Step 2: Update CODE QUALITY pending list**

Change the index.tsx pending line to:

```markdown
- [PENDING REFACTOR]: Split `mobile/app/(tabs)/index.tsx` into `home-hero` / `home-kpis` / `home-feed` during the unified dashboard pass.
- Layout direction is owned by `lib/layout-dir.ts` + `mobile/src/layout-dir.ts`. Do not hardcode `flexDirection: "row"` for locale-sensitive stacks.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SSOT/SRS.md docs/SSOT/CODE\ QUALITY.md
git commit -m "$(cat <<'EOF'
docs: specify locale-aware layout and shared dashboard primitives

EOF
)"
```

---

### Task 2: Pure layout engine (TDD) — this is the checkbox fix

**Files:**
- Create: `lib/layout-dir.ts`
- Create: `lib/__tests__/layout-dir.test.ts`
- Modify: `package.json` (`test` script — add `lib/__tests__/layout-dir.test.ts`)

**Interfaces:**
- Produces:

```ts
export type LayoutEngine = {
  rtl: boolean;
  nativeSwaps: boolean;
  cssDirFollowsLocale: boolean;
};

export function rowFlexDirection(e: LayoutEngine): "row" | "row-reverse";
export function physicalTextStart(e: LayoutEngine): "left" | "right";
export function physicalAlignStart(e: LayoutEngine): "flex-start" | "flex-end";
export function physicalAlignEnd(e: LayoutEngine): "flex-start" | "flex-end";
export function chevronBackName(rtl: boolean): "chevron-back" | "chevron-forward";
export function chevronForwardName(rtl: boolean): "chevron-back" | "chevron-forward";
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rowFlexDirection,
  physicalTextStart,
  physicalAlignStart,
  physicalAlignEnd,
  chevronBackName,
  chevronForwardName,
} from "../layout-dir";

const nativeHe = { rtl: true, nativeSwaps: false, cssDirFollowsLocale: false };
const nativeEn = { rtl: false, nativeSwaps: false, cssDirFollowsLocale: false };
const webHe = { rtl: true, nativeSwaps: false, cssDirFollowsLocale: true };
const webEn = { rtl: false, nativeSwaps: false, cssDirFollowsLocale: true };
const nativeRtlHe = { rtl: true, nativeSwaps: true, cssDirFollowsLocale: false };

describe("rowFlexDirection", () => {
  it("native Hebrew uses row-reverse so first child is physical right", () => {
    assert.equal(rowFlexDirection(nativeHe), "row-reverse");
  });
  it("native English uses row so first child is physical left", () => {
    assert.equal(rowFlexDirection(nativeEn), "row");
  });
  it("web Hebrew uses row (CSS dir already reverses) — no double-flip", () => {
    assert.equal(rowFlexDirection(webHe), "row");
  });
  it("web English uses row", () => {
    assert.equal(rowFlexDirection(webEn), "row");
  });
  it("native I18nManager RTL + Hebrew uses row (engine already swaps)", () => {
    assert.equal(rowFlexDirection(nativeRtlHe), "row");
  });
});

describe("checkbox start edge (first child of row)", () => {
  it("Hebrew text start is physical right when native does not swap", () => {
    assert.equal(physicalTextStart(nativeHe), "right");
    assert.equal(physicalTextStart(webHe), "right");
  });
  it("English text start is physical left", () => {
    assert.equal(physicalTextStart(nativeEn), "left");
    assert.equal(physicalTextStart(webEn), "left");
  });
});

describe("chat bubble alignment", () => {
  it("native Hebrew: other=physical right, user=physical left", () => {
    assert.equal(physicalAlignStart(nativeHe), "flex-end");
    assert.equal(physicalAlignEnd(nativeHe), "flex-start");
  });
  it("web Hebrew: CSS dir maps flex-start to inline-start", () => {
    assert.equal(physicalAlignStart(webHe), "flex-start");
    assert.equal(physicalAlignEnd(webHe), "flex-end");
  });
  it("English: other=left, user=right", () => {
    assert.equal(physicalAlignStart(nativeEn), "flex-start");
    assert.equal(physicalAlignEnd(nativeEn), "flex-end");
  });
});

describe("content chevrons", () => {
  it("Hebrew back points toward inline-start (right)", () => {
    assert.equal(chevronBackName(true), "chevron-forward");
    assert.equal(chevronForwardName(true), "chevron-back");
  });
  it("English back keeps chevron-back", () => {
    assert.equal(chevronBackName(false), "chevron-back");
    assert.equal(chevronForwardName(false), "chevron-forward");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/__tests__/layout-dir.test.ts`

Expected: FAIL with `Cannot find module '../layout-dir'`

- [ ] **Step 3: Write minimal implementation**

```ts
export type LayoutEngine = {
  rtl: boolean;
  nativeSwaps: boolean;
  cssDirFollowsLocale: boolean;
};

export function rowFlexDirection(e: LayoutEngine): "row" | "row-reverse" {
  if (e.cssDirFollowsLocale) return "row";
  return e.rtl === e.nativeSwaps ? "row" : "row-reverse";
}

export function physicalTextStart(e: LayoutEngine): "left" | "right" {
  return e.rtl === e.nativeSwaps ? "left" : "right";
}

export function physicalAlignStart(e: LayoutEngine): "flex-start" | "flex-end" {
  if (e.cssDirFollowsLocale) return "flex-start";
  return e.rtl === e.nativeSwaps ? "flex-start" : "flex-end";
}

export function physicalAlignEnd(e: LayoutEngine): "flex-start" | "flex-end" {
  return physicalAlignStart(e) === "flex-start" ? "flex-end" : "flex-start";
}

export function chevronBackName(rtl: boolean): "chevron-back" | "chevron-forward" {
  return rtl ? "chevron-forward" : "chevron-back";
}

export function chevronForwardName(rtl: boolean): "chevron-back" | "chevron-forward" {
  return rtl ? "chevron-back" : "chevron-forward";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test lib/__tests__/layout-dir.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Register the test in `package.json` `test` script** (append `lib/__tests__/layout-dir.test.ts` next to the other paths) **and commit**

```bash
git add lib/layout-dir.ts lib/__tests__/layout-dir.test.ts package.json
git commit -m "$(cat <<'EOF'
fix: stop web RTL from double-flipping flex rows

EOF
)"
```

---

### Task 3: Wire `useLayoutDir` to the engine

**Files:**
- Modify: `mobile/src/layout-dir.ts`

**Interfaces:**
- Consumes: `rowFlexDirection`, `physicalTextStart`, `physicalAlignStart`, `physicalAlignEnd`, `chevronBackName`, `chevronForwardName` from `lib/layout-dir.ts`
- Produces: hook return shape below. `Row` in `ui.tsx` already uses `row`, so TaskCard checkbox follows automatically.

```ts
return {
  rtl,
  textStart,
  writingDirection,
  textLtr,
  textStyle,
  row: { flexDirection, alignItems: "center" },
  timeRow: { flexDirection: "row" as const, direction: "ltr" as const, alignItems: "center" as const },
  alignStart,
  alignEnd,
  chevronBack: chevronBackName(rtl),
  chevronForward: chevronForwardName(rtl),
  menuAnchor,
};
```

- [ ] **Step 1: Replace `mobile/src/layout-dir.ts` with this implementation**

```ts
import { useMemo } from "react";
import { I18nManager, Platform, type TextStyle, type ViewStyle } from "react-native";
import {
  chevronBackName,
  chevronForwardName,
  physicalAlignEnd,
  physicalAlignStart,
  physicalTextStart,
  rowFlexDirection,
} from "@/lib/layout-dir";
import { useI18n } from "./i18n";

export function useLayoutDir() {
  const { rtl } = useI18n();

  return useMemo(() => {
    const nativeSwaps = I18nManager.isRTL;
    const cssDirFollowsLocale = Platform.OS === "web";
    const engine = { rtl, nativeSwaps, cssDirFollowsLocale };
    const textStart = physicalTextStart(engine);
    const writingDirection: NonNullable<TextStyle["writingDirection"]> = rtl ? "rtl" : "ltr";
    const flexDirection = rowFlexDirection(engine);
    const alignStart = physicalAlignStart(engine);
    const alignEnd = physicalAlignEnd(engine);

    return {
      rtl,
      textStart,
      writingDirection,
      textLtr: (nativeSwaps ? "right" : "left") as TextStyle["textAlign"],
      textStyle: { textAlign: textStart, writingDirection } as TextStyle,
      row: { flexDirection, alignItems: "center" as const },
      timeRow: {
        flexDirection: "row" as const,
        direction: "ltr" as const,
        alignItems: "center" as const,
      },
      alignStart,
      alignEnd,
      chevronBack: chevronBackName(rtl),
      chevronForward: chevronForwardName(rtl),
      menuAnchor: {
        alignItems: (rtl ? "flex-end" : "flex-start") as ViewStyle["alignItems"],
      },
    };
  }, [rtl]);
}
```

`menuAnchor` stays physical (menu opens from the hamburger, which is already on start via `row`). Do not use CSS-dir here; the overlay is positioned in the RN tree.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p mobile/tsconfig.json`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/src/layout-dir.ts
git commit -m "$(cat <<'EOF'
fix: drive RN layout from the shared locale engine

EOF
)"
```

After this commit, Hebrew web checkbox must sit on the right and English on the left. Verify on Expo web by toggling Settings → language before proceeding.

---

### Task 4: Shared dashboard primitives

**Files:**
- Create: `mobile/src/components/ui/kpi-grid.tsx`
- Create: `mobile/src/components/ui/hub-links.tsx`
- Create: `mobile/src/components/ui/hero-metric.tsx`
- Create: `mobile/src/components/ui/progress-bar.tsx`
- Create: `mobile/src/components/ui/time-nav.tsx`
- Modify: `mobile/src/components/trading/charts.tsx` (delete local `KpiGrid`, re-export shared)
- Modify: `mobile/src/components/finance/finance-hub-links.tsx`
- Modify: `mobile/src/components/trading/blocks.tsx` (`TradingHubLinks`)
- Modify: `mobile/src/components/finance/month-nav.tsx` (re-export `TimeNav` as `FinanceMonthNav` or switch call sites)
- Modify: `lib/i18n/messages.ts` (add `common.prevMonth`, `common.nextMonth` if missing)

**Interfaces:**
- Produces:

```ts
export type KpiItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "default";
  onPress?: () => void;
};
export function KpiGrid(props: { items: KpiItem[] }): JSX.Element;

export type HubLink = {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};
export function HubLinks(props: { links: HubLink[] }): JSX.Element;

export function HeroMetric(props: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "default";
  align?: "start" | "center";
  children?: React.ReactNode;
}): JSX.Element;

export function ProgressBar(props: { ratio: number; tone?: "accent" | "warn" | "good" }): JSX.Element;

export function TimeNav(props: {
  label: string;
  canGoPrev?: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onLabelPress?: () => void;
  prevLabel: string;
  nextLabel: string;
}): JSX.Element;
```

- [ ] **Step 1: Add i18n keys (he + en)**

```ts
// common.prevMonth / common.nextMonth
he: prevMonth: "חודש קודם", nextMonth: "חודש הבא"
en: prevMonth: "Previous month", nextMonth: "Next month"
```

- [ ] **Step 2: Implement `kpi-grid.tsx`**

Move the current Trading `KpiGrid` here. Differences from today:

- Use `layout.row` + `flexWrap` on the container (not raw `"row"`).
- Each tile is a `Pressable` when `onPress` is set (`cursor` / opacity).
- Require `id` as React key (labels can duplicate after i18n).
- `textAlign: textStart` on value and hint.
- `minHeight` not required; padding 10, `flexBasis: "30%"`, `minWidth: 100`.

```tsx
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export type KpiItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "default";
  onPress?: () => void;
};

export function KpiGrid({ items }: { items: KpiItem[] }) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  return (
    <View style={{ ...row, flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "stretch" }}>
      {items.map((k) => {
        const color = k.tone === "good" ? c.good : k.tone === "warn" ? c.warn : c.ink;
        const inner = (
          <>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{k.label}</Text>
            <Text style={{ color, fontSize: 17, fontWeight: "800", marginTop: 2, textAlign: textStart }}>{k.value}</Text>
            {k.hint ? (
              <Text style={{ color: c.muted, fontSize: 10, marginTop: 2, textAlign: textStart, writingDirection }}>{k.hint}</Text>
            ) : null}
          </>
        );
        const tileStyle = {
          flexGrow: 1,
          flexBasis: "30%" as const,
          minWidth: 100,
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: tokens.radiusSm,
          padding: 10,
        };
        return k.onPress ? (
          <Pressable key={k.id} onPress={k.onPress} accessibilityRole="button" style={({ pressed }) => [tileStyle, { opacity: pressed ? 0.85 : 1 }]}>
            {inner}
          </Pressable>
        ) : (
          <View key={k.id} style={tileStyle}>{inner}</View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 3: Implement `hub-links.tsx`**

Same tile anatomy as current `FinanceHubLinks`, but `layout.row` inside and wrapping container uses `layout.row` + wrap. Props are already-translated `label` strings (caller uses `t()`).

- [ ] **Step 4: Implement `hero-metric.tsx`**

```tsx
export function HeroMetric({ label, value, tone = "default", align = "start", children }: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "default";
  align?: "start" | "center";
  children?: React.ReactNode;
}) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const color = tone === "good" ? c.good : tone === "warn" ? c.warn : c.ink;
  const textAlign = align === "center" ? "center" : textStart;
  return (
    <Card style={{ paddingVertical: 16, marginBottom: 12 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", textAlign, writingDirection }}>{label}</Text>
      <Text style={{ color, fontWeight: "800", fontSize: 32, lineHeight: 38, marginTop: 2, textAlign, fontVariant: ["tabular-nums"] }}>{value}</Text>
      {children}
    </Card>
  );
}
```

Refactor `FinanceHero` to render `HeroMetric align="center"` plus the existing income/expense split as `children`. Keep `ils` formatting in FinanceHero until Task 6 introduces `formatIls`.

- [ ] **Step 5: Implement `progress-bar.tsx`**

```tsx
export function ProgressBar({ ratio, tone = "accent" }: { ratio: number; tone?: "accent" | "warn" | "good" }) {
  const c = useColors();
  const { rtl } = useLayoutDir();
  const color = tone === "warn" ? c.warn : tone === "good" ? c.good : c.accent;
  const width = `${Math.max(4, Math.min(1, ratio) * 100)}%`;
  return (
    <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, overflow: "hidden" }}>
      <View style={{ height: 6, width, backgroundColor: color, borderRadius: 3, alignSelf: rtl ? "flex-end" : "flex-start" }} />
    </View>
  );
}
```

On web RTL, CSS dir already puts `flex-end` on the left — **wrong**. Use the engine: add `progressAlignSelf(e)` to `lib/layout-dir.ts` in this task (TDD): native Hebrew → `flex-end` (fill from right); web Hebrew → `flex-start` because CSS dir makes flex-start = right. English → `flex-start`.

Add tests:

```ts
it("progress grows from start", () => {
  assert.equal(progressAlignSelf(nativeHe), "flex-end");
  assert.equal(progressAlignSelf(webHe), "flex-start");
  assert.equal(progressAlignSelf(nativeEn), "flex-start");
});
```

```ts
export function progressAlignSelf(e: LayoutEngine): "flex-start" | "flex-end" {
  return physicalAlignStart(e);
}
```

Wire `ProgressBar` to `progressAlignSelf` via the hook (`alignStart`). Replace the fill `View` in `remaining-week.tsx` with `<ProgressBar ratio={ratio} tone={over ? "warn" : "accent"} />`.

- [ ] **Step 6: Implement `time-nav.tsx` (LTR exception)**

Use `layout.timeRow`, `justifyContent: "space-between"`. Icons: always `chevron-back` on the left button and `chevron-forward` on the right button (time direction, not reading direction). Accessibility labels come from props (`prevLabel` / `nextLabel`). Switch `FinanceMonthNav` to:

```tsx
export function FinanceMonthNav(props: Omit<React.ComponentProps<typeof TimeNav>, "prevLabel" | "nextLabel">) {
  const { t } = useI18n();
  return <TimeNav {...props} prevLabel={t("common.prevMonth")} nextLabel={t("common.nextMonth")} />;
}
```

- [ ] **Step 7: Point Trading `KpiGrid` and both HubLinks at the shared files.** Update `mobile/app/(tabs)/trading.tsx` KPI items to include `id`. Keep visual output identical.

- [ ] **Step 8: Typecheck + commit**

```bash
npx tsc --noEmit -p mobile/tsconfig.json
git add mobile/src/components/ui/kpi-grid.tsx mobile/src/components/ui/hub-links.tsx \
  mobile/src/components/ui/hero-metric.tsx mobile/src/components/ui/progress-bar.tsx \
  mobile/src/components/ui/time-nav.tsx mobile/src/components/trading/charts.tsx \
  mobile/src/components/trading/blocks.tsx mobile/src/components/finance/finance-hub-links.tsx \
  mobile/src/components/finance/month-nav.tsx mobile/src/components/finance/finance-hero.tsx \
  mobile/src/components/finance/remaining-week.tsx lib/layout-dir.ts lib/__tests__/layout-dir.test.ts \
  lib/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat: share dashboard primitives across finance, trading, and home

EOF
)"
```

---

### Task 5: Home snapshots API (lean)

Do **not** call `getDashboard()` from `/home` (too heavy: universe, triggers, marks).

**Files:**
- Create: `lib/home-snapshots.ts`
- Create: `lib/__tests__/home-snapshots.test.ts`
- Modify: `app/api/v1/home/route.ts`
- Modify: `mobile/src/api/resources.ts`
- Modify: `lib/__tests__/query-patch.test.ts` (add the new fields on every mock `HomePayload`)
- Modify: `package.json` test script

**Interfaces:**
- Produces:

```ts
export type HomeFinanceSnapshot = {
  month: string;
  net_actual: number;
  uncategorized_count: number;
};
export type HomeTradingSnapshot = {
  phase: string;
  equity: number;
  kill_switch_active: boolean;
};
export function currentMonthKey(d: Date): string; // YYYY-MM
```

`HomePayload` gains:

```ts
finance: HomeFinanceSnapshot;
trading: HomeTradingSnapshot | null; // null if trading_settings row missing
```

Keep `financeUncategorizedCount` in sync with `finance.uncategorized_count` so existing patch helpers still work.

- [ ] **Step 1: Failing tests for `currentMonthKey`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentMonthKey } from "../home-snapshots";

describe("currentMonthKey", () => {
  it("pads month", () => {
    assert.equal(currentMonthKey(new Date("2026-09-14T12:00:00Z")), "2026-09");
  });
});
```

Use a UTC date whose local month is unambiguous or construct `new Date(2026, 8, 14)`.

- [ ] **Step 2: Implement `currentMonthKey`**

```ts
export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Extend `/home` GET**

Add two parallel queries next to the existing `Promise.all`:

Finance (NFR-UX-04 lean columns):

```ts
.from("finance_transactions")
.select("txn_date, amount, kind, category, needs_categorization, is_internal")
.gte("txn_date", `${month}-01`)
.lte("txn_date", `${month}-31`)
```

Then `summarizeCashflow(rows, month)` from `lib/finance/cashflow.ts`.

Trading:

```ts
.from("trading_settings").select("phase, peak_equity, starting_equity, kill_switch_active").eq("id", true).maybeSingle()
```

Shape:

```ts
trading: settingsRow
  ? {
      phase: settingsRow.phase ?? "BACKTEST",
      equity: Number(settingsRow.peak_equity ?? settingsRow.starting_equity ?? 0),
      kill_switch_active: Boolean(settingsRow.kill_switch_active),
    }
  : null
finance: {
  month,
  net_actual: summary.net,
  uncategorized_count: summary.uncategorized_count,
}
financeUncategorizedCount: summary.uncategorized_count || financeUncategorizedRes.count || 0
```

Prefer `summarizeCashflow.uncategorized_count` for the month; keep the existing global uncategorized **count** query if month-scoped would hide older uncategorized items. FR-FIN-05 is “uncategorized exist”, not “this month only”. So:

- `financeUncategorizedCount` = existing head-count (all uncategorized)
- `finance.net_actual` = current month net
- `finance.uncategorized_count` = same as `financeUncategorizedCount` (global), not month-scoped

Do not drop the existing uncategorized count query.

- [ ] **Step 4: Update `HomePayload` and every mock in `query-patch.test.ts`**

```ts
finance: { month: "2026-09", net_actual: 0, uncategorized_count: 0 },
trading: { phase: "PAPER", equity: 100000, kill_switch_active: false },
```

- [ ] **Step 5: Run tests + commit**

```bash
node --import tsx --test lib/__tests__/home-snapshots.test.ts lib/__tests__/query-patch.test.ts lib/__tests__/cashflow.test.ts
git add lib/home-snapshots.ts lib/__tests__/home-snapshots.test.ts app/api/v1/home/route.ts \
  mobile/src/api/resources.ts lib/__tests__/query-patch.test.ts package.json
git commit -m "$(cat <<'EOF'
feat: add lean finance and trading snapshots to home

EOF
)"
```

---

### Task 6: Pure Home KPI builder (TDD)

**Files:**
- Create: `lib/home-kpis.ts`
- Create: `lib/__tests__/home-kpis.test.ts`
- Modify: `package.json` test script
- Delete later: `lib/home-stats-grid.ts`, `lib/__tests__/home-stats-grid.test.ts`, `mobile/src/components/home-stats-grid.tsx`

**Interfaces:**

```ts
export type HomeKpiInput = {
  habitsCount: number;
  dueRelationships: number;
  activeGoals: number;
  openTasks: number;
  habitsPending: number;
  tasksDueSoon: number;
  bestStreak: number;
  readyGoals: number;
  financeUncategorized: number;
  financeNet: number;
  tradingEquity: number | null;
  tradingKill: boolean;
};

export type HomeKpiSpec = {
  id: string;
  labelKey: string;
  value: string;
  hintKey?: string;
  hintParams?: Record<string, string | number>;
  tone: "good" | "warn" | "default";
  href: "/habits" | "/relationships" | "/goals" | "/tasks" | "/finance" | "/trading";
};

export function homeHeroCount(i: Pick<HomeKpiInput, "habitsPending" | "dueRelationships" | "tasksDueSoon" | "financeUncategorized">): number;
export function buildHomeKpis(i: HomeKpiInput): HomeKpiSpec[];
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHomeKpis, homeHeroCount } from "../home-kpis";

const base: HomeKpiInput = {
  habitsCount: 4,
  dueRelationships: 2,
  activeGoals: 3,
  openTasks: 9,
  habitsPending: 1,
  tasksDueSoon: 3,
  bestStreak: 12,
  readyGoals: 2,
  financeUncategorized: 5,
  financeNet: -420,
  tradingEquity: 101500,
  tradingKill: false,
};

describe("homeHeroCount", () => {
  it("sums actionable items", () => {
    assert.equal(homeHeroCount(base), 1 + 2 + 3 + 5);
  });
  it("zero when the day is clear", () => {
    assert.equal(homeHeroCount({ habitsPending: 0, dueRelationships: 0, tasksDueSoon: 0, financeUncategorized: 0 }), 0);
  });
});

describe("buildHomeKpis", () => {
  it("always includes at least 8 metrics plus finance net and trading", () => {
    const ids = buildHomeKpis(base).map((k) => k.id);
    assert.ok(ids.length >= 8);
    assert.ok(ids.includes("finance-net"));
    assert.ok(ids.includes("trading"));
    assert.ok(ids.includes("finance-uncat"));
  });
  it("omits uncategorized tile when count is 0", () => {
    const ids = buildHomeKpis({ ...base, financeUncategorized: 0 }).map((k) => k.id);
    assert.equal(ids.includes("finance-uncat"), false);
  });
  it("omits trading tile when equity is null", () => {
    const ids = buildHomeKpis({ ...base, tradingEquity: null }).map((k) => k.id);
    assert.equal(ids.includes("trading"), false);
  });
  it("warns when net is negative and when kill switch is on", () => {
    assert.equal(buildHomeKpis(base).find((k) => k.id === "finance-net")?.tone, "warn");
    assert.equal(buildHomeKpis({ ...base, tradingKill: true }).find((k) => k.id === "trading")?.tone, "warn");
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

- [ ] **Step 3: Implement**

```ts
export function homeHeroCount(i: {
  habitsPending: number;
  dueRelationships: number;
  tasksDueSoon: number;
  financeUncategorized: number;
}): number {
  return i.habitsPending + i.dueRelationships + i.tasksDueSoon + i.financeUncategorized;
}

export function buildHomeKpis(i: HomeKpiInput): HomeKpiSpec[] {
  const items: HomeKpiSpec[] = [
    { id: "tasks", labelKey: "home.openTasks", value: String(i.openTasks), tone: i.openTasks > 0 ? "default" : "good", href: "/tasks" },
    { id: "habits-pending", labelKey: "home.habitsPendingToday", value: String(i.habitsPending), tone: i.habitsPending > 0 ? "warn" : "good", href: "/habits" },
    { id: "relationships", labelKey: "home.relationshipsOverdue", value: String(i.dueRelationships), tone: i.dueRelationships > 0 ? "warn" : "good", href: "/relationships" },
    { id: "goals", labelKey: "home.activeGoals", value: String(i.activeGoals), tone: "default", href: "/goals" },
    { id: "finance-net", labelKey: "home.financeNet", value: String(i.financeNet), tone: i.financeNet < 0 ? "warn" : i.financeNet > 0 ? "good" : "default", href: "/finance" },
    { id: "habits", labelKey: "home.activeHabits", value: String(i.habitsCount), tone: "default", href: "/habits" },
    { id: "tasks-due", labelKey: "home.tasksDueSoon", value: String(i.tasksDueSoon), tone: i.tasksDueSoon > 0 ? "warn" : "default", href: "/tasks" },
    { id: "streak", labelKey: "home.bestActiveStreak", value: String(i.bestStreak), tone: "default", href: "/habits" },
    { id: "ready-goals", labelKey: "home.readyGoals", value: String(i.readyGoals), tone: "good", href: "/goals" },
  ];
  if (i.tradingEquity !== null) {
    items.splice(5, 0, {
      id: "trading",
      labelKey: "home.tradingEquity",
      value: String(i.tradingEquity),
      tone: i.tradingKill ? "warn" : "default",
      href: "/trading",
    });
  }
  if (i.financeUncategorized > 0) {
    items.push({
      id: "finance-uncat",
      labelKey: "home.financeUncategorized",
      value: String(i.financeUncategorized),
      tone: "warn",
      href: "/finance",
    });
  }
  return items;
}
```

Display formatting (₪ / $) happens in the UI layer with locale formatters — the builder returns raw number strings. Tests compare raw strings.

- [ ] **Step 4: Tests PASS. Remove `lib/home-stats-grid.ts` + its test + from `package.json` `test` script. Add the new test path.**

- [ ] **Step 5: Commit**

```bash
git add lib/home-kpis.ts lib/__tests__/home-kpis.test.ts package.json
git rm lib/home-stats-grid.ts lib/__tests__/home-stats-grid.test.ts
git commit -m "$(cat <<'EOF'
feat: build home KPIs with finance and trading tiles

EOF
)"
```

---

### Task 7: Restyle Home to the Finance/Trading skeleton

**Files:**
- Create: `mobile/src/components/home/home-hero.tsx`
- Create: `mobile/src/components/home/home-kpis.tsx`
- Create: `mobile/src/components/home/home-feed.tsx`
- Modify: `mobile/app/(tabs)/index.tsx` (data + mutations only, target < 200 lines)
- Delete: `mobile/src/components/home-stats-grid.tsx`
- Modify: `lib/i18n/messages.ts`

**Interfaces:**
- Consumes: `HeroMetric`, `KpiGrid`, `buildHomeKpis`, `homeHeroCount`, HomePayload snapshots
- Produces: Home screen chrome matching Finance/Trading

Home layout (top to bottom):

1. `Screen` with `title={t("home.compass")}` and `subtitle={t("home.quote")}` — drop the large quote Card. Mission text is not shown on Home (still in messages for elsewhere / later). This matches Finance title+subtitle.
2. `HeroMetric` `align="start"`  
   - label: `t("home.heroLabel")`  
   - value: `String(homeHeroCount(...))`  
   - tone: count > 0 ? `"warn"` : `"good"`  
   - children: one muted line `t("home.heroHint")` or `t("home.heroClear")`
3. `KpiGrid` from `buildHomeKpis`. Format `finance-net` with the same ₪ formatter Finance uses; format `trading` with `fmtUsd` from `lib/trading/format.ts`.
4. Existing actionable lists, moved into `home-feed.tsx` (habits pending, goals, commitments, tasks, relationships, events, library). Keep FR-HOME-02 behavior exactly.
5. Delete the footer `Link` cluster (`toTimeline` / `fullList` / `toLibrary`) — SectionTitle already navigates.

- [ ] **Step 1: Add i18n keys (he + en)**

```ts
heroLabel: "צריך אותך היום" / "Needs you today"
heroHint: "הרגלים, קשרים, דדליינים ותנועות לסיווג" / "Habits, people, deadlines, and uncategorized charges"
heroClear: "היום פנוי — כל הכבוד" / "All clear today"
financeNet: "נטו החודש" / "Net this month"
tradingEquity: "מסחר" / "Trading"
```

Strip trailing `←` from `home.fullList`, `home.toTimeline`, `home.toLibrary`, `home.allHabits`, `home.manageRelationships`, `home.toTasks`, `home.toProjects` (even if unused after footer removal).

- [ ] **Step 2: `home-hero.tsx` and `home-kpis.tsx`**

`home-kpis.tsx` maps `HomeKpiSpec` → `KpiItem` (translate labels, format values, `router.push(href)`).

Format helpers (keep in this file or a tiny `lib/format-money.ts` if you need tests):

```ts
import { localeTag } from "@/lib/i18n/core";
export function formatSignedIls(n: number, locale: Locale): string {
  const abs = Math.abs(Math.round(n)).toLocaleString(localeTag(locale));
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}₪${abs}`;
}
```

- [ ] **Step 3: Move list JSX from `index.tsx` into `home-feed.tsx`**

Props: data slices + mutation callbacks already in `index.tsx` (`toggleTaskDone`, habit check-in, contacted-today, etc.). Do not duplicate query logic.

- [ ] **Step 4: `index.tsx` becomes: query, derived stats, callbacks, `<Screen><Hero/><Kpis/><Feed/></Screen>` + the two existing modals.**

If still over 200 lines, extract the task/habit/relationship mutation helpers into `mobile/src/components/home/home-actions.ts` (plain async functions taking `run` + `queryClient`).

- [ ] **Step 5: Delete `home-stats-grid.tsx`. Typecheck. Commit**

```bash
npx tsc --noEmit -p mobile/tsconfig.json
git add mobile/app/\(tabs\)/index.tsx mobile/src/components/home/ mobile/src/components/home-stats-grid.tsx lib/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat: restyle home to match finance and trading dashboards

EOF
)"
```

Manual check: Hebrew + English, Home shows hero + KPI tiles including כסף/מסחר, tapping a KPI opens the matching tab, FR-HOME-02 lists still work (complete a task, check in a habit).

---

### Task 8: Locale copy sweep (no layout yet)

**Files:**
- Modify: `mobile/src/components/finance/txn-row.tsx`
- Modify: `mobile/src/components/trading/blocks.tsx`
- Modify: `mobile/app/(tabs)/trading.tsx`
- Modify: `mobile/src/components/finance/finance-hero.tsx`
- Modify: `lib/i18n/messages.ts`

- [ ] **Step 1: `txn-row.tsx` — use i18n**

```ts
const { t } = useI18n();
const typeLabel =
  txn.expense_type === "fixed"
    ? t("finance.expenseTypeFixed")
    : txn.expense_type === "savings"
      ? t("finance.expenseTypeSavings")
      : txn.expense_type === "variable"
        ? t("finance.expenseTypeRegular")
        : null;
```

Add `useI18n` import. Amount stays `₪` prefixed but wrap the amount `Text` with `writingDirection: "ltr"` so the sign does not bidi-flip.

- [ ] **Step 2: Trading hardcoded strings → keys**

```ts
he: injectionFlag: "הזרקה", agentError: "שגיאת סוכן: {msg}", trackBase: "בסיס", paramsVersion: "פרמטרים {version}", trail: "נגרר"
en: injectionFlag: "Injection", agentError: "Agent error: {msg}", trackBase: "Base", paramsVersion: "params {version}", trail: "trail"
```

Replace `⚠ injection` with `<Badge label={t("trading.injectionFlag")} tone="warn" />` (no emoji). Replace `agent: {error}` with `t("trading.agentError", { msg })`. Replace `BASE` with `t("trading.trackBase")`. Replace `"trail"` in `PositionCard` with `t("trading.trail")`. Replace ``params ${data.params.version}`` with `t("trading.paramsVersion", { version: data.params.version })`.

- [ ] **Step 3: `FinanceHero` `ils()` uses `localeTag(locale)`**

```ts
function ils(n: number, locale: Locale): string {
  return `₪${Math.round(n).toLocaleString(localeTag(locale))}`;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
git add mobile/src/components/finance/txn-row.tsx mobile/src/components/trading/blocks.tsx \
  mobile/app/\(tabs\)/trading.tsx mobile/src/components/finance/finance-hero.tsx lib/i18n/messages.ts
git commit -m "$(cat <<'EOF'
fix: drive finance and trading chrome from i18n

EOF
)"
```

---

### Task 9: Start/end alignment on chrome that still uses physical sides

**Files:**
- Modify: `mobile/app/agent-chat.tsx`
- Modify: `mobile/app/trading-chat.tsx`
- Modify: `mobile/src/components/ui.tsx` (`ErrorNote` retry `alignSelf`)
- Modify: `mobile/src/components/task-card.tsx` only if checkbox is not first in `Row` (it already is — add an explicit comment, do not reorder)

- [ ] **Step 1: Chat bubbles**

```tsx
const { alignStart, alignEnd, textStart, writingDirection } = useLayoutDir();
// user
alignSelf: msg.role === "user" ? alignEnd : alignStart
```

Do the same in `trading-chat.tsx`.

- [ ] **Step 2: `ErrorNote` retry button**

```tsx
<View style={{ marginTop: 8, alignSelf: alignStart }}>
```

- [ ] **Step 3: Confirm `TaskCard` structure stays**

```tsx
<Row style={{ alignItems: "flex-start", gap: 10 }}>
  <TaskDoneCheckbox ... />
  {titleBlock}
</Row>
```

Do **not** put the checkbox after the title. First child + engine = start edge.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/agent-chat.tsx mobile/app/trading-chat.tsx mobile/src/components/ui.tsx mobile/src/components/task-card.tsx
git commit -m "$(cat <<'EOF'
fix: align chat and task checkbox to the locale start edge

EOF
)"
```

---

### Task 10: Replace leftover physical `flexDirection: "row"` (locale-sensitive only)

**Files (switch container to `layout.row` + wrap when needed):**
- `mobile/src/components/finance/finance-sources-strip.tsx`
- `mobile/src/components/finance/week-strip.tsx` (the **labels** row — keep bar chart internals LTR if they encode time left-to-right; if bars are Sunday→Thursday chronological, wrap the chart in `layout.timeRow` / `direction: "ltr"` and keep that)
- `mobile/src/components/finance/categorize-controls.tsx`
- `mobile/src/components/finance/category-picker.tsx`
- `mobile/src/components/finance/txn-datetime-fields.tsx`
- `mobile/src/components/finance/plan-line-row.tsx`
- `mobile/src/components/finance/history-trends-panel.tsx` (label rows use `layout.row`; the mini bar chart stays LTR)
- `mobile/app/finance-planning.tsx`
- `mobile/app/finance-wealth.tsx`
- `mobile/app/trading-trade.tsx` (key/value rows: `layout.row` + `justifyContent: "space-between"`; numeric values `writingDirection: "ltr"`)

**Do not change:** `centered-tab-bar.tsx`, `trading/charts.tsx` plot geometry, `timeline-canvas.tsx` (time axis), `time-nav.tsx`.

- [ ] **Step 1: For each file, replace `flexDirection: "row"` that lays out labels/chips/actions with `...row` from `useLayoutDir()`.**

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix: use locale row helpers instead of physical flexDirection

EOF
)"
```

---

### Task 11: Unify remaining entity screens to the same card rhythm

Apply the dashboard chrome without changing business rules.

**Files:**
- `mobile/app/(tabs)/tasks.tsx`
- `mobile/app/(tabs)/habits.tsx`
- `mobile/app/(tabs)/goals.tsx`
- `mobile/app/(tabs)/relationships.tsx`
- `mobile/app/(tabs)/library.tsx`
- `mobile/app/(tabs)/settings.tsx`
- `mobile/src/components/habit-card.tsx`
- `mobile/src/components/habit-stat-tile.tsx`
- `mobile/src/components/goal-card.tsx`
- `mobile/src/components/relationship-card.tsx`
- `mobile/src/components/form-modal.tsx`

Rules for every screen:

1. `Screen` / `ScreenList` already provides title 22 + subtitle 13 — keep it; do not invent a second header.
2. Filters/chips sit in `Row` (locale).
3. List rows: `Card` + start-aligned text + trailing action on the **end** side (last child in `Row`).
4. Habit mini-stats: replace 9px `StatTile` internals with the KPI tile padding/type (label `tokens.textXs`, value 17/800) **or** a 3-item `KpiGrid` on the habit details modal only. Do not shrink Home-style 9px back in.
5. `FormModal` primary stays first in `Row` (start). Close (X) if added later goes `alignEnd`.
6. Settings language chips already use `Row` — no change besides confirming Hebrew selection immediately flips checkbox/chat (regression).
7. Pressables: opacity hover/press 0.7–0.85, no scale.
8. `EmptyState` / `ErrorNote` / `Loading` reused as-is.

- [ ] **Step 1: Habits `StatTile` type scale**

In `habit-stat-tile.tsx` change label from `fontSize: 9` to `tokens.textXs` (12) and keep the compact tile. This is the generic type scale, not a one-off.

- [ ] **Step 2: Relationship / goal / habit cards already use `Row` first-child-as-start. Leave structure; only fix any physical `justifyContent: "flex-start"` that fights `row-reverse` (it is usually harmless). Prefer omitting `justifyContent` so start packing wins.**

- [ ] **Step 3: Tasks screen — no extra checkbox. Confirm `TaskCard` is the only complete-control.**

- [ ] **Step 4: Typecheck + commit**

```bash
git commit -m "$(cat <<'EOF'
fix: align entity screens with shared type and row rhythm

EOF
)"
```

---

### Task 12: Verification (required before calling done)

No new product code. Run the suite and a locale matrix.

- [ ] **Step 1: Automated**

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p mobile/tsconfig.json
```

Expected: PASS. `home-stats-grid` tests are gone; `layout-dir` and `home-kpis` are present.

- [ ] **Step 2: Locale matrix (Expo web + native if available)**

For **Hebrew** then **English** (Settings language chips):

| Check | Hebrew | English |
|---|---|---|
| Task Done checkbox | Physical right of title | Physical left of title |
| Section `+` | Start edge | Start edge |
| FormModal primary | Start edge | Start edge |
| User chat bubble | End edge (left) | End edge (right) |
| Finance month chevron-back | Physical **left** (earlier) | Physical left |
| Home hero + KPI tiles | Same anatomy as Trading | Same |
| Home finance net / trading tiles | Navigate to those tabs | Same |
| Bottom Home tab | Visual **right** | Visual right |
| txn-row expense type | Translated | Translated |
| No `←` in Home | — | — |

- [ ] **Step 3: Regression**

- Complete a task on Home and on Tasks (NFR-UX-01 optimistic).
- Finance remaining-week bar fills from start.
- Trading hub links still open journal/analytics/backtests/chat/control.
- Quote is subtitle, not a giant card. Mission card gone from Home.

- [ ] **Step 4: If shipping**, bump `package.json`, `mobile/package.json`, and `mobile/app.json` patch version together. Do not bump until the user asks to ship.

---

## Self-review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| FR-HOME-01 no shortcut cards | Task 7 (KPI tiles only) |
| FR-HOME-02 lists | Task 7 `home-feed.tsx` |
| FR-HOME-03 readable KPI grid | Tasks 4, 6, 7 |
| FR-HOME-04 finance + trading on Home | Tasks 5–7 |
| FR-FIN-05 uncategorized tile | Task 6 omit-when-zero |
| FR-I18N-01 start-edge + copy | Tasks 2, 3, 8, 9, 10 |
| FR-UI-01 shared primitives | Task 4 |
| FR-NAV-01 Home tab right | Explicitly untouched |
| FR-TASK-01 checkbox complete | Tasks 2, 9 |
| FR-TOAST-01 | Untouched; toast already uses `textStart` |
| NFR-UX-01 optimistic Home | Task 7 keeps existing mutations |
| NFR-UX-03/05 lists | Home still maps small capped lists; Tasks stays ScreenList |
| NFR-UX-04 lean home | Task 5 does not call `getDashboard()` |

**2. Placeholder scan:** none. File paths, types, and commands are concrete.

**3. Type consistency:** `HomePayload.finance` / `trading` in Task 5 match Task 6–7. `KpiItem.id` is required. `useLayoutDir().row` / `alignStart` / `alignEnd` / `timeRow` / `chevronBack` names are stable from Task 3 onward.

**Out of scope (do not do):** new fonts / Heebo loading, rewriting Timeline canvas, changing tab order, adding Home hub shortcuts, calling full trading dashboard from `/home`, restyling `/legacy`.
