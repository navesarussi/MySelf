# Home Dashboard Polish + Device Contacts Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile home dashboard show only actionable relationships/events, denser smart stats, tappable goal/library cards, a Done button on tasks, and device-contact import (plus email) when creating relationships.

**Architecture:** Extract pure helpers under `lib/` for due-relationship filtering, home event mode selection, and device-contact field mapping (TDD). Adjust `/api/v1/home` event query + library `body`. Mobile UI changes in home, TaskCard, and relationships; add `expo-contacts` for the system picker. Website UI stays frozen.

**Tech Stack:** Expo 54 / React Native, Next.js App Router API, Supabase `myself` schema, `node:test` + `tsx`, `expo-contacts`.

**Design spec:** `docs/superpowers/specs/2026-07-17-home-dashboard-contacts-design.md`

## Global Constraints

- Product surface: **mobile only** — do not edit Next.js website UI (`app/**/page.tsx`, site `components/**`).
- Shared backend allowed: `app/api/**`, `lib/**`, `supabase/**`.
- Docs in English; user-facing copy via `lib/i18n/messages.ts` (he + en).
- Max ~200 lines per file; split helpers rather than grow `index.tsx` further.
- No two-way phone-book sync; no bulk import; no Google Contacts OAuth.
- Bump `mobile/package.json` + `mobile/app.json` version when shipping (minor: new contact import feature).

---

## File map

| File | Responsibility |
|---|---|
| `lib/relationships-due.ts` | Pure due/overdue predicate + filter |
| `lib/home-events.ts` | Pure upcoming vs recent event selection |
| `lib/device-contact-map.ts` | Map Expo contact → form fields |
| `lib/__tests__/relationships-due.test.ts` | Due filter tests |
| `lib/__tests__/home-events.test.ts` | Events mode tests |
| `lib/__tests__/device-contact-map.test.ts` | Mapping tests |
| `supabase/migrations/0014_relationship_email.sql` | `email` column |
| `lib/types.ts` | `Relationship.email` |
| `app/api/v1/relationships/route.ts` | POST accepts `email` |
| `app/api/v1/relationships/[id]/route.ts` | PATCH accepts `email` |
| `app/api/v1/home/route.ts` | Events mode + library `body` |
| `mobile/src/api/resources.ts` | `HomePayload` + email on types |
| `mobile/src/components/task-card.tsx` | Done button instead of checkbox |
| `mobile/app/(tabs)/index.tsx` | Filters, stats, events title, modals |
| `mobile/app/(tabs)/relationships.tsx` | Email, picker flow, phone align |
| `mobile/app.json` | Contacts permission strings + plugin |
| `mobile/package.json` | `expo-contacts` + version bump |
| `lib/i18n/messages.ts` | New home/relationships keys |
| `docs/SSOT/SRS.md` | FR-HOME-02/03, FR-REL-EMAIL, FR-REL-DEVICE-IMPORT |
| `package.json` | Register new test files in `test` script |

---

### Task 1: Due-relationship helper (TDD)

**Files:**
- Create: `lib/relationships-due.ts`
- Create: `lib/__tests__/relationships-due.test.ts`
- Modify: `package.json` (add test path)

**Interfaces:**
- Produces:
  - `isRelationshipDue(r: { last_contact_date: string | null; reminder_days: number | null }, today: Date): boolean`
  - `filterDueRelationships<T extends { last_contact_date: string | null; reminder_days: number | null; name: string }>(rows: T[], today: Date): T[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRelationshipDue, filterDueRelationships } from "../relationships-due";

describe("isRelationshipDue", () => {
  const today = new Date("2026-07-17T12:00:00");

  it("false when reminder_days is null", () => {
    assert.equal(isRelationshipDue({ last_contact_date: null, reminder_days: null }, today), false);
  });

  it("true when never contacted and reminder set", () => {
    assert.equal(isRelationshipDue({ last_contact_date: null, reminder_days: 7 }, today), true);
  });

  it("true when days since contact equals reminder (due today)", () => {
    assert.equal(
      isRelationshipDue({ last_contact_date: "2026-07-10", reminder_days: 7 }, today),
      true
    );
  });

  it("true when overdue", () => {
    assert.equal(
      isRelationshipDue({ last_contact_date: "2026-07-01", reminder_days: 7 }, today),
      true
    );
  });

  it("false when still within window", () => {
    assert.equal(
      isRelationshipDue({ last_contact_date: "2026-07-15", reminder_days: 7 }, today),
      false
    );
  });
});

describe("filterDueRelationships", () => {
  it("keeps only due rows sorted overdue-first then name", () => {
    const today = new Date("2026-07-17T12:00:00");
    const rows = [
      { name: "בועז", last_contact_date: "2026-07-16", reminder_days: 7 },
      { name: "אבי", last_contact_date: "2026-07-01", reminder_days: 7 },
      { name: "גיל", last_contact_date: null, reminder_days: 3 },
    ];
    assert.deepEqual(
      filterDueRelationships(rows, today).map((r) => r.name),
      ["אבי", "גיל"]
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/__tests__/relationships-due.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper**

```ts
import { differenceInCalendarDays } from "date-fns";

export type DueFields = {
  last_contact_date: string | null;
  reminder_days: number | null;
};

export function isRelationshipDue(r: DueFields, today: Date): boolean {
  if (r.reminder_days == null) return false;
  const days = r.last_contact_date
    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
    : Infinity;
  return days >= r.reminder_days;
}

export function filterDueRelationships<T extends DueFields & { name: string }>(
  rows: T[],
  today: Date
): T[] {
  return rows
    .filter((r) => isRelationshipDue(r, today))
    .sort((a, b) => {
      const daysA = a.last_contact_date
        ? differenceInCalendarDays(today, new Date(a.last_contact_date))
        : Infinity;
      const daysB = b.last_contact_date
        ? differenceInCalendarDays(today, new Date(b.last_contact_date))
        : Infinity;
      if (daysA !== daysB) return daysB - daysA;
      return a.name.localeCompare(b.name, "he");
    });
}
```

- [ ] **Step 4: Register test + run pass**

In root `package.json` `test` script, append:
`lib/__tests__/relationships-due.test.ts`

Run: `node --import tsx --test lib/__tests__/relationships-due.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/relationships-due.ts lib/__tests__/relationships-due.test.ts package.json
git commit -m "feat: due-relationship filter helper for home"
```

---

### Task 2: Home events selection helper (TDD)

**Files:**
- Create: `lib/home-events.ts`
- Create: `lib/__tests__/home-events.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `type HomeEventsMode = "upcoming" | "recent"`
  - `selectHomeEvents(events, now, limit?): { mode: HomeEventsMode; events }`

Clarified rule from spec:
- If ≥1 visible event with `event_date >= todayISO` and year === current year → `upcoming`: next `limit` events with datetime ≥ now, ascending.
- Else → `recent`: last `limit` past events (datetime < now), descending.
- Skip rows where `hidden_at` is set.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectHomeEvents } from "../home-events";

function ev(id: string, event_date: string, event_time: string | null = null) {
  return { id, event_date, event_time, hidden_at: null };
}

describe("selectHomeEvents", () => {
  const now = new Date("2026-07-17T12:00:00");

  it("returns upcoming when at least one future event is in the current year", () => {
    const events = [
      ev("past", "2026-01-01"),
      ev("soon", "2026-07-20"),
      ev("later", "2027-01-01"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "upcoming");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["soon", "later"]
    );
  });

  it("falls back to recent when no upcoming event in current year", () => {
    const events = [
      ev("old", "2025-12-01"),
      ev("newer", "2026-03-01"),
      ev("far", "2027-06-01"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "recent");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["newer", "old"]
    );
  });

  it("ignores hidden events", () => {
    const events = [
      { id: "hidden", event_date: "2026-08-01", event_time: null, hidden_at: "2026-01-01" },
      ev("ok", "2026-08-02"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "upcoming");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["ok"]
    );
  });

  it("limits to 10", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      ev(`e${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`)
    );
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.events.length, 10);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --import tsx --test lib/__tests__/home-events.test.ts`

- [ ] **Step 3: Implement**

```ts
export type HomeEventLike = {
  id: string;
  event_date: string;
  event_time: string | null;
  hidden_at?: string | null;
};

export type HomeEventsMode = "upcoming" | "recent";

function eventInstant(e: HomeEventLike): Date {
  const t = e.event_time?.trim();
  if (t) return new Date(`${e.event_date}T${t.length === 5 ? `${t}:00` : t}`);
  return new Date(`${e.event_date}T23:59:59`);
}

function todayISO(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function selectHomeEvents(
  events: HomeEventLike[],
  now: Date,
  limit = 10
): { mode: HomeEventsMode; events: HomeEventLike[] } {
  const visible = events.filter((e) => !e.hidden_at);
  const year = now.getFullYear();
  const today = todayISO(now);

  const hasUpcomingThisYear = visible.some((e) => {
    if (e.event_date < today) return false;
    return Number(e.event_date.slice(0, 4)) === year;
  });

  if (hasUpcomingThisYear) {
    const upcoming = visible
      .filter((e) => eventInstant(e) >= now)
      .sort((a, b) => eventInstant(a).getTime() - eventInstant(b).getTime())
      .slice(0, limit);
    return { mode: "upcoming", events: upcoming };
  }

  const recent = visible
    .filter((e) => eventInstant(e) < now)
    .sort((a, b) => eventInstant(b).getTime() - eventInstant(a).getTime())
    .slice(0, limit);
  return { mode: "recent", events: recent };
}
```

Note: date-only events use end-of-day so “today” without time still counts as upcoming until the day ends. Use local `todayISO` (not UTC `toISOString`) to avoid timezone day shifts.

- [ ] **Step 4: Register + pass**

Append `lib/__tests__/home-events.test.ts` to `package.json` `test` script.  
Run tests — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/home-events.ts lib/__tests__/home-events.test.ts package.json
git commit -m "feat: home upcoming/recent events selection helper"
```

---

### Task 3: Device contact mapping helper (TDD)

**Files:**
- Create: `lib/device-contact-map.ts`
- Create: `lib/__tests__/device-contact-map.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `type DeviceContactInput = { name?: string | null; firstName?: string | null; lastName?: string | null; phoneNumbers?: { number?: string | null }[] | null; emails?: { email?: string | null }[] | null }`
  - `type DeviceContactFields = { name: string; phone: string; email: string }`
  - `mapDeviceContact(contact: DeviceContactInput): DeviceContactFields`

- [ ] **Step 1: Failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapDeviceContact } from "../device-contact-map";

describe("mapDeviceContact", () => {
  it("prefers display name and first phone/email", () => {
    assert.deepEqual(
      mapDeviceContact({
        name: "דני כהן",
        phoneNumbers: [{ number: "050-111-2222" }, { number: "03-1234567" }],
        emails: [{ email: "dani@example.com" }, { email: "other@x.com" }],
      }),
      { name: "דני כהן", phone: "050-111-2222", email: "dani@example.com" }
    );
  });

  it("builds name from first+last when name missing", () => {
    assert.deepEqual(
      mapDeviceContact({ firstName: "Dana", lastName: "Levi", phoneNumbers: [], emails: [] }),
      { name: "Dana Levi", phone: "", email: "" }
    );
  });

  it("returns empty strings when fields missing", () => {
    assert.deepEqual(mapDeviceContact({}), { name: "", phone: "", email: "" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
export type DeviceContactInput = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { number?: string | null }[] | null;
  emails?: { email?: string | null }[] | null;
};

export type DeviceContactFields = {
  name: string;
  phone: string;
  email: string;
};

export function mapDeviceContact(contact: DeviceContactInput): DeviceContactFields {
  const composed = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const name = (contact.name?.trim() || composed || "").trim();
  const phone = contact.phoneNumbers?.find((p) => p.number?.trim())?.number?.trim() ?? "";
  const email = contact.emails?.find((e) => e.email?.trim())?.email?.trim() ?? "";
  return { name, phone, email };
}
```

- [ ] **Step 4: Register + pass + commit**

```bash
git add lib/device-contact-map.ts lib/__tests__/device-contact-map.test.ts package.json
git commit -m "feat: map device contact fields for relationship form"
```

---

### Task 4: Email column + API + types + SRS

**Files:**
- Create: `supabase/migrations/0014_relationship_email.sql`
- Modify: `lib/types.ts` (`Relationship`)
- Modify: `app/api/v1/relationships/route.ts`
- Modify: `app/api/v1/relationships/[id]/route.ts`
- Modify: `docs/SSOT/SRS.md`

**Interfaces:**
- Produces: `Relationship.email: string | null`; POST/PATCH accept `email` via `optStr`

- [ ] **Step 1: Migration**

```sql
-- Optional email on relationships (FR-REL-EMAIL)
alter table myself.relationships
  add column if not exists email text;
```

- [ ] **Step 2: Type**

In `lib/types.ts` on `Relationship`, add after `phone`:

```ts
  email: string | null;
```

- [ ] **Step 3: POST insert email**

In `route.ts` POST `insert({...})` add:

```ts
      email: optStr(body.email),
```

- [ ] **Step 4: PATCH email**

In `[id]/route.ts` after phone block:

```ts
  if ("email" in body) patch.email = optStr(body.email);
```

- [ ] **Step 5: SRS entries** (English)

```md
### FR-HOME-02
Home relationships list shows only contacts due today or overdue (`days_since_last_contact >= reminder_days`).
Home events show the next 10 upcoming events (title: upcoming); if none exist in the current calendar year, show the 10 most recent past events.
Library and goal cards on home support open/edit/delete via the same forms as their tabs.

### FR-HOME-03
Home stats show at least 8 compact metrics without enlarging the stats block beyond denser cards.

### FR-REL-EMAIL
Relationships may store an optional email. Mobile form and create/update APIs include the field.

### FR-REL-DEVICE-IMPORT
Creating a relationship on mobile offers the system contact picker after permission. Selection pre-fills name, primary phone, and primary email; fields remain editable. Dismiss/deny → empty form. Secondary import control remains on the form.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0014_relationship_email.sql lib/types.ts \
  app/api/v1/relationships/route.ts app/api/v1/relationships/[id]/route.ts docs/SSOT/SRS.md
git commit -m "feat: add optional email on relationships"
```

---

### Task 5: Home API — events mode + library body

**Files:**
- Modify: `app/api/v1/home/route.ts`
- Modify: `mobile/src/api/resources.ts` (`HomePayload`)

**Interfaces:**
- Consumes: `selectHomeEvents` from `lib/home-events.ts`
- Produces: `HomePayload.eventsMode: "upcoming" | "recent"`; `libraryEntries` includes `body`

- [ ] **Step 1: Widen events fetch + select**

In `app/api/v1/home/route.ts`:

```ts
import { selectHomeEvents } from "@/lib/home-events";
```

Change events query:

```ts
    supabase
      .from("timeline_events")
      .select("*")
      .is("hidden_at", null)
      .order("event_date", { ascending: false })
      .limit(200),
```

Library select:

```ts
      .select("id, title, category, tags, body, updated_at")
```

Relationships select add email:

```ts
      .select("id, name, last_contact_date, reminder_days, phone, email")
```

After Promise.all:

```ts
  const selected = selectHomeEvents(eventsRes.data || [], new Date(), 10);
```

Return:

```ts
    recentEvents: selected.events,
    eventsMode: selected.mode,
    libraryEntries: libraryRes.data || [],
```

- [ ] **Step 2: Update `HomePayload`**

```ts
  relationships: Pick<
    Relationship,
    "id" | "name" | "last_contact_date" | "reminder_days" | "phone" | "email"
  >[];
  recentEvents: TimelineEvent[];
  eventsMode: "upcoming" | "recent";
  libraryEntries: Pick<ContentEntry, "id" | "title" | "category" | "tags" | "body" | "updated_at">[];
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/home/route.ts mobile/src/api/resources.ts
git commit -m "feat: home API upcoming/recent events and library body"
```

---

### Task 6: TaskCard Done button

**Files:**
- Modify: `mobile/src/components/task-card.tsx`

**Interfaces:**
- Consumes: existing `onToggleDone`, `Btn`, `t("common.done")`
- Produces: same public props; no checkbox

- [ ] **Step 1: Replace Checkbox with Done button**

Remove `Checkbox` import. Import `Btn`. In the card `Row`, put Done `Btn` first (row start = left in Hebrew RTL):

```tsx
  return (
    <Card style={{ opacity: done ? 0.55 : 1 }}>
      <Row>
        <Btn
          small
          label={t("common.done")}
          variant={done ? "ghost" : "primary"}
          disabled={busy}
          onPress={() => onToggleDone(task)}
        />
        {onPress ? (
          <Pressable style={{ flex: 1 }} onPress={() => onPress(task)}>
            {Body}
          </Pressable>
        ) : (
          Body
        )}
        <Pressable onPress={() => onAdvanceStatus?.(task)} disabled={busy || !onAdvanceStatus}>
          <Badge
            label={taskStatusLabel(t, task.status)}
            tone={done ? "good" : task.status === "in_progress" ? "accent" : "default"}
          />
        </Pressable>
      </Row>
    </Card>
  );
```

- [ ] **Step 2: Manual check** — Done is on the start side; toggles done.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/task-card.tsx
git commit -m "feat: replace task checkbox with Done button"
```

---

### Task 7: Home screen — due list, events title, dense stats, modals

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Modify: `lib/i18n/messages.ts`
- Create (only if `index.tsx` would exceed ~250 lines): `mobile/src/components/home-goal-modal.tsx`, `mobile/src/components/home-library-modal.tsx`

**Interfaces:**
- Consumes: `filterDueRelationships`, `achievabilityScore`, `eventsMode`, FormModal patterns from goals/library

i18n keys (he + en):

| Key | HE | EN |
|---|---|---|
| `home.upcomingEvents` | אירועים קרובים | Upcoming events |
| `home.habitsPendingToday` | הרגלים לדיווח | Habits to report |
| `home.habitsPendingSub` | טרם דווחו היום | Not reported today |
| `home.tasksDueSoon` | דדליין קרוב | Due soon |
| `home.tasksDueSoonSub` | תוך 7 ימים | Within 7 days |
| `home.bestActiveStreak` | רצף מקסימלי | Best active streak |
| `home.bestActiveStreakSub` | בין הרגלים פעילים | Among active habits |
| `home.readyGoals` | מוכנים לפעולה | Ready to act |
| `home.readyGoalsSub` | עם צעד ראשון | With a first step |
| `home.noDueRelationships` | אין קשרים שמחכים היום | No contacts due today |
| `relationships.emailPlaceholder` | אימייל | Email |
| `relationships.importFromDevice` | ייבוא מאנשי קשר | Import from contacts |

- [ ] **Step 1: Shrink StatCard**

Change `minWidth` from `150` to `100`, main font from `20` to `16`, pass `style={{ padding: 10 }}` to Card.

- [ ] **Step 2: Due relationships only**

```ts
import { filterDueRelationships } from "@/lib/relationships-due";

const dueRelationships = useMemo(
  () => filterDueRelationships(relationships as Relationship[], todayDate),
  [relationships, todayDate]
);
```

Render `dueRelationships`. Empty → `t("home.noDueRelationships")`.

- [ ] **Step 3: Events section title**

```tsx
<SectionTitle>
  {data.eventsMode === "upcoming" ? t("home.upcomingEvents") : t("home.recentEvents")}
</SectionTitle>
```

Map `data.recentEvents` (already limited by API); remove client `.slice(0, 10)` if redundant.

- [ ] **Step 4: Eight stats**

```ts
const habitsPendingCount = habitsPendingToday.length;
const dueSoonTasks = data.openTasks.filter((task) => {
  if (!task.due_date) return false;
  const due = new Date(task.due_date);
  const horizon = new Date(todayDate);
  horizon.setDate(horizon.getDate() + 7);
  return due <= horizon;
}).length;
const bestStreak = uniqueHabits.reduce(
  (m, h) => Math.max(m, effectiveStreak(h, habitReportDay(h.report_time))),
  0
);
const readyGoals = (data.activeGoals ?? []).filter((g) => achievabilityScore(g) >= 3).length;
```

Render 8 StatCards in wrapping Rows. Press targets: pending/streak → habits; due soon → tasks; ready → goals; keep existing four targets.

- [ ] **Step 5: Goal + library FormModals on home**

Add `goalForm` / `libraryForm` state. Pressable goal/library cards open FormModal. Fields mirror `goals.tsx` / `library.tsx`. Submit/delete via existing APIs + `refresh()`.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/(tabs)/index.tsx lib/i18n/messages.ts mobile/src/components/
git commit -m "feat: actionable home sections, dense stats, editable cards"
```

---

### Task 8: Relationships — email, phone align, device picker

**Files:**
- Modify: `mobile/app/(tabs)/relationships.tsx`
- Modify: `mobile/package.json` (add `expo-contacts`, bump `1.5.0` → `1.6.0`)
- Modify: `mobile/app.json` (plugin + permission strings, version `1.6.0`)
- Modify: `lib/i18n/messages.ts` if keys missing

**Interfaces:**
- Consumes: `mapDeviceContact`, `expo-contacts`

- [ ] **Step 1: Install dependency**

From `mobile/`:

```bash
npx expo install expo-contacts
```

- [ ] **Step 2: app.json permissions**

```json
"plugins": [
  [
    "expo-contacts",
    {
      "contactsPermission": "לאפשר ל-MeAndMySelf לקרוא אנשי קשר כדי למלא פרטי קשר חדשים."
    }
  ]
],
"ios": {
  "infoPlist": {
    "NSContactsUsageDescription": "לאפשר ל-MeAndMySelf לקרוא אנשי קשר כדי למלא פרטי קשר חדשים."
  }
}
```

Bump `"version"` to `1.6.0` in `app.json` and `mobile/package.json`.

- [ ] **Step 3: FormState + email field**

Extend `FormState` with `email: string`. Include in empty/edit/submit:

```ts
email: form.email || null,
```

Input after phone with `keyboardType="email-address"`.

- [ ] **Step 4: Fix phone placeholder alignment**

```tsx
<Input
  value={form.phone}
  onChangeText={(v) => setForm({ ...form, phone: v })}
  placeholder={t("relationships.phonePlaceholder")}
  keyboardType="phone-pad"
  style={form.phone ? { textAlign: textLtr } : undefined}
/>
```

- [ ] **Step 5: Picker helpers**

```ts
import * as Contacts from "expo-contacts";
import { mapDeviceContact } from "@/lib/device-contact-map";

async function pickDeviceContact() {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return null;
  const contact = await Contacts.presentContactPickerAsync();
  if (!contact) return null;
  return mapDeviceContact(contact);
}
```

- [ ] **Step 6: Create flow**

```ts
async function startCreate() {
  const picked = await pickDeviceContact();
  setForm({
    ...emptyForm(defaultProjectId),
    ...(picked
      ? { name: picked.name, phone: picked.phone, email: picked.email }
      : {}),
  });
}
```

Wire header add + `params.add` to `startCreate`. Form always shows secondary `importFromDevice` button that merges picked fields without wiping unrelated edits when empty.

- [ ] **Step 7: Show email on cards** when present (muted secondary line).

- [ ] **Step 8: Commit**

```bash
git add mobile/app/(tabs)/relationships.tsx mobile/package.json mobile/app.json \
  mobile/package-lock.json lib/i18n/messages.ts
git commit -m "feat: import device contacts and email on relationships"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npm test
```

Expected: all PASS including the three new files.

- [ ] **Step 2: Typecheck mobile**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke (Expo)**

1. Home: only due contacts; Done on tasks (start side); events title switches; 8 small stats; tap goal/library → edit/delete.
2. Relationships: add → picker or empty form; email saves; phone placeholder RTL when empty.

- [ ] **Step 4: Commit any leftover fixes if needed**

```bash
git status
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Due/overdue relationships only on home | 1, 7 |
| Task Done button (RTL start) | 6 |
| Upcoming 10 / recent fallback + titles | 2, 5, 7 |
| Library + goals open/edit/delete on home | 5, 7 |
| 8 dense smart stats | 7 |
| Device contacts picker on create | 3, 8 |
| Cancel/deny → empty form | 8 |
| Secondary import button | 8 |
| Email field + API + migration | 4, 8 |
| Phone placeholder RTL fix | 8 |
| SRS FR-HOME-02/03, FR-REL-EMAIL, FR-REL-DEVICE-IMPORT | 4 |
| Website frozen | Global constraint |

## Self-review notes

- No TBD placeholders in steps.
- Helper names (`selectHomeEvents`, `filterDueRelationships`, `mapDeviceContact`) consistent across tasks.
- Home keeps `recentEvents` key; `eventsMode` drives the title.
- `expo-contacts` may need a native build for full picker; deny/unavailable → empty form is required.
