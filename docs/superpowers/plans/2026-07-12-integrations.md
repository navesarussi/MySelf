# Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync primary Google Calendar events into the MySelf timeline (with calendar icon and local overrides) and add optional WhatsApp quick-links on relationships.

**Architecture:** Extend existing `timeline_events` and `relationships` tables; add `integration_tokens` for OAuth. Pure sync/mapping logic in `lib/integrations/google-calendar/` (testable without DB). OAuth + sync via Next.js API routes; weekly cron via Vercel. No `googleapis` npm package — use `fetch` against Google REST APIs.

**Tech Stack:** Next.js 16 App Router, Supabase (`myself` schema), `date-fns`, `lucide-react`, `node:test` + `tsx` for unit tests.

**Design spec:** `docs/superpowers/specs/2026-07-12-integrations-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0006_integrations.sql` | Schema changes |
| `lib/types.ts` | Extended `TimelineEvent`, `Relationship` types |
| `lib/timeline-display.ts` | `displayTitle`, `displayDescription`, `isGoogleCalendarEvent` |
| `lib/integrations/phone.ts` | Normalize phone → `wa.me` URL |
| `lib/integrations/google-config.ts` | Env var checks |
| `lib/integrations/tokens.ts` | Read/write `integration_tokens` |
| `lib/integrations/google-calendar/types.ts` | Google API response shapes |
| `lib/integrations/google-calendar/map.ts` | Map Google event → DB row (pure) |
| `lib/integrations/google-calendar/sync.ts` | Upsert/delete logic (pure + DB orchestration) |
| `lib/integrations/google-calendar/client.ts` | OAuth token exchange, refresh, paginated fetch |
| `app/api/integrations/google/connect/route.ts` | Redirect to Google OAuth |
| `app/api/integrations/google/callback/route.ts` | Exchange code, store tokens, initial sync |
| `app/api/integrations/google/sync/route.ts` | Manual + cron sync |
| `app/api/integrations/google/disconnect/route.ts` | Clear tokens |
| `app/settings/page.tsx` | Connect/disconnect/sync UI |
| `app/settings/actions.ts` | Server action for sync trigger |
| `app/timeline/actions.ts` | Override-aware update, soft-hide delete |
| `app/timeline/event-card.tsx` | Calendar icon |
| `app/timeline/event-edit-form.tsx` | Override fields + hint |
| `app/timeline/sync-bar.tsx` | Last sync + Sync now |
| `app/timeline/page.tsx` | Filter hidden, pass connection status |
| `app/relationships/page.tsx` | Phone field + WhatsApp button |
| `app/relationships/actions.ts` | Save phone |
| `app/page.tsx` | WhatsApp link on overdue contacts |
| `components/nav.tsx` | Settings link |
| `vercel.json` | Weekly cron |
| `.env.example` | Google + cron env vars |
| `docs/SSOT/SRS.md` | FR-INT-GCAL-01–04, FR-INT-WA-01 |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0006_integrations.sql`

- [ ] **Step 1: Write migration**

```sql
-- Integration tokens (single-user)
create table if not exists myself.integration_tokens (
  provider text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

-- Timeline event integration columns
alter table myself.timeline_events
  add column if not exists source text not null default 'manual',
  add column if not exists google_event_id text,
  add column if not exists title_override text,
  add column if not exists description_override text,
  add column if not exists hidden_at timestamptz,
  add column if not exists synced_at timestamptz;

create unique index if not exists timeline_events_google_event_id_idx
  on myself.timeline_events (google_event_id)
  where google_event_id is not null;

-- Relationships phone
alter table myself.relationships
  add column if not exists phone text;
```

- [ ] **Step 2: Apply migration** (local Supabase or remote SQL editor)

Run migration against your Supabase project.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_integrations.sql
git commit -m "feat(db): add integration tokens and calendar sync columns"
```

---

### Task 2: Types and display helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/timeline-display.ts`

- [ ] **Step 1: Extend types in `lib/types.ts`**

Add to `TimelineEvent`:

```typescript
export type EventSource = "manual" | "google_calendar";

export type TimelineEvent = {
  id: string;
  event_date: string;
  event_time: string | null;
  title: string;
  description: string | null;
  category: string | null;
  source: EventSource;
  google_event_id: string | null;
  title_override: string | null;
  description_override: string | null;
  hidden_at: string | null;
  synced_at: string | null;
  created_at: string;
};
```

Add to `Relationship`:

```typescript
  phone: string | null;
```

Add:

```typescript
export type IntegrationToken = {
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
  last_sync_at: string | null;
};
```

- [ ] **Step 2: Create `lib/timeline-display.ts`**

```typescript
import type { TimelineEvent } from "@/lib/types";

export function isGoogleCalendarEvent(event: Pick<TimelineEvent, "source">) {
  return event.source === "google_calendar";
}

export function displayTitle(event: Pick<TimelineEvent, "title" | "title_override">) {
  return event.title_override ?? event.title;
}

export function displayDescription(
  event: Pick<TimelineEvent, "description" | "description_override">
) {
  return event.description_override ?? event.description;
}

export function isEventHidden(event: Pick<TimelineEvent, "hidden_at">) {
  return event.hidden_at != null;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/timeline-display.ts
git commit -m "feat: extend types and timeline display helpers for integrations"
```

---

### Task 3: Phone utilities (TDD)

**Files:**
- Create: `lib/integrations/phone.ts`
- Create: `lib/__tests__/phone.test.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Add test script to `package.json`**

```json
"scripts": {
  "test": "node --import tsx --test lib/__tests__/**/*.test.ts"
}
```

Also add devDependency: `"tsx": "^4.19.0"`

Run: `npm install`

- [ ] **Step 2: Write failing test `lib/__tests__/phone.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, whatsappUrl, isValidPhone } from "../integrations/phone";

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    assert.equal(normalizePhone("050-123-4567"), "0501234567");
  });

  it("converts Israeli 05x to 9725x", () => {
    assert.equal(normalizePhone("0501234567"), "972501234567");
  });

  it("keeps already-international numbers", () => {
    assert.equal(normalizePhone("+972501234567"), "972501234567");
  });
});

describe("whatsappUrl", () => {
  it("builds wa.me link", () => {
    assert.equal(whatsappUrl("0501234567"), "https://wa.me/972501234567");
  });

  it("returns null for invalid", () => {
    assert.equal(whatsappUrl("abc"), null);
  });
});

describe("isValidPhone", () => {
  it("accepts normalized Israeli mobile", () => {
    assert.equal(isValidPhone("0501234567"), true);
  });

  it("rejects too short", () => {
    assert.equal(isValidPhone("123"), false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/__tests__/phone.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `lib/integrations/phone.ts`**

```typescript
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  return n.length >= 11 && n.length <= 15;
}

export function whatsappUrl(raw: string): string | null {
  if (!isValidPhone(raw)) return null;
  return `https://wa.me/${normalizePhone(raw)}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/__tests__/phone.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/integrations/phone.ts lib/__tests__/phone.test.ts
git commit -m "feat: add phone normalization and WhatsApp URL helpers"
```

---

### Task 4: Google event mapping (TDD)

**Files:**
- Create: `lib/integrations/google-calendar/types.ts`
- Create: `lib/integrations/google-calendar/map.ts`
- Create: `lib/__tests__/google-calendar-map.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapGoogleEvent } from "../integrations/google-calendar/map";
import type { GoogleCalendarEvent } from "../integrations/google-calendar/types";

const timed: GoogleCalendarEvent = {
  id: "evt1",
  status: "confirmed",
  summary: "Meeting",
  description: "Notes",
  start: { dateTime: "2026-07-15T10:30:00+03:00" },
  end: { dateTime: "2026-07-15T11:30:00+03:00" },
};

const allDay: GoogleCalendarEvent = {
  id: "evt2",
  status: "confirmed",
  summary: "Birthday",
  start: { date: "2026-07-20" },
  end: { date: "2026-07-21" },
};

describe("mapGoogleEvent", () => {
  it("maps timed event", () => {
    const row = mapGoogleEvent(timed);
    assert.equal(row?.google_event_id, "evt1");
    assert.equal(row?.title, "Meeting");
    assert.equal(row?.event_date, "2026-07-15");
    assert.equal(row?.event_time, "10:30:00");
    assert.equal(row?.category, "יומן");
    assert.equal(row?.source, "google_calendar");
  });

  it("maps all-day event", () => {
    const row = mapGoogleEvent(allDay);
    assert.equal(row?.event_date, "2026-07-20");
    assert.equal(row?.event_time, null);
  });

  it("returns null for cancelled", () => {
    assert.equal(mapGoogleEvent({ ...timed, status: "cancelled" }), null);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- lib/__tests__/google-calendar-map.test.ts`

- [ ] **Step 3: Create `lib/integrations/google-calendar/types.ts`**

```typescript
export type GoogleCalendarEvent = {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
};

export type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
};

export type MappedGoogleEvent = {
  google_event_id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  category: "יומן";
  source: "google_calendar";
};
```

- [ ] **Step 4: Create `lib/integrations/google-calendar/map.ts`**

```typescript
import type { GoogleCalendarEvent, MappedGoogleEvent } from "./types";

function parseStart(start: GoogleCalendarEvent["start"]) {
  if (start.date) {
    return { event_date: start.date, event_time: null };
  }
  if (start.dateTime) {
    const d = new Date(start.dateTime);
    const event_date = d.toISOString().slice(0, 10);
    const event_time = d.toTimeString().slice(0, 8);
    return { event_date, event_time };
  }
  return null;
}

export function mapGoogleEvent(event: GoogleCalendarEvent): MappedGoogleEvent | null {
  if (event.status === "cancelled") return null;
  const parsed = parseStart(event.start);
  if (!parsed) return null;

  return {
    google_event_id: event.id,
    title: event.summary?.trim() || "(ללא כותרת)",
    description: event.description?.trim() || null,
    event_date: parsed.event_date,
    event_time: parsed.event_time,
    category: "יומן",
    source: "google_calendar",
  };
}
```

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/google-calendar/types.ts lib/integrations/google-calendar/map.ts lib/__tests__/google-calendar-map.test.ts
git commit -m "feat: map Google Calendar events to timeline rows"
```

---

### Task 5: Sync merge logic (TDD)

**Files:**
- Create: `lib/integrations/google-calendar/merge.ts`
- Create: `lib/__tests__/google-calendar-merge.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildUpsertPayload, shouldRemoveLocal } from "../integrations/google-calendar/merge";

describe("buildUpsertPayload", () => {
  it("uses mapped fields on insert", () => {
    const payload = buildUpsertPayload(
      { google_event_id: "g1", title: "A", description: null, event_date: "2026-01-01", event_time: null, category: "יומן", source: "google_calendar" },
      null
    );
    assert.equal(payload.title, "A");
    assert.equal(payload.title_override, undefined);
  });

  it("preserves overrides on update", () => {
    const payload = buildUpsertPayload(
      { google_event_id: "g1", title: "New", description: "D", event_date: "2026-01-01", event_time: null, category: "יומן", source: "google_calendar" },
      { title_override: "My title", description_override: null, hidden_at: null }
    );
    assert.equal(payload.title, "New");
    assert.equal(payload.title_override, "My title");
    assert.equal(payload.description, "D");
  });
});

describe("shouldRemoveLocal", () => {
  it("removes google events missing from fetch", () => {
    assert.equal(
      shouldRemoveLocal({ source: "google_calendar", google_event_id: "gone", title_override: null, description_override: null, hidden_at: null }, new Set(["keep"])),
      true
    );
  });

  it("keeps events with overrides", () => {
    assert.equal(
      shouldRemoveLocal({ source: "google_calendar", google_event_id: "gone", title_override: "x", description_override: null, hidden_at: null }, new Set()),
      false
    );
  });

  it("keeps hidden events", () => {
    assert.equal(
      shouldRemoveLocal({ source: "google_calendar", google_event_id: "gone", title_override: null, description_override: null, hidden_at: "2026-01-01" }, new Set()),
      false
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement `lib/integrations/google-calendar/merge.ts`**

```typescript
import type { MappedGoogleEvent } from "./types";

type ExistingRow = {
  title_override: string | null;
  description_override: string | null;
  hidden_at: string | null;
};

export function buildUpsertPayload(mapped: MappedGoogleEvent, existing: ExistingRow | null) {
  const base = {
    ...mapped,
    synced_at: new Date().toISOString(),
  };
  if (!existing) return base;
  return {
    ...base,
    title_override: existing.title_override ?? undefined,
    description_override: existing.description_override ?? undefined,
    hidden_at: existing.hidden_at ?? undefined,
  };
}

export function shouldRemoveLocal(
  row: {
    source: string;
    google_event_id: string | null;
    title_override: string | null;
    description_override: string | null;
    hidden_at: string | null;
  },
  fetchedIds: Set<string>
) {
  if (row.source !== "google_calendar" || !row.google_event_id) return false;
  if (row.hidden_at) return false;
  if (row.title_override || row.description_override) return false;
  return !fetchedIds.has(row.google_event_id);
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/google-calendar/merge.ts lib/__tests__/google-calendar-merge.test.ts
git commit -m "feat: add Google Calendar sync merge and removal rules"
```

---

### Task 6: Google config, tokens, and API client

**Files:**
- Create: `lib/integrations/google-config.ts`
- Create: `lib/integrations/tokens.ts`
- Create: `lib/integrations/google-calendar/client.ts`
- Create: `lib/integrations/google-calendar/sync.ts`

- [ ] **Step 1: Create `lib/integrations/google-config.ts`**

```typescript
export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_PROVIDER = "google_calendar";
```

- [ ] **Step 2: Create `lib/integrations/tokens.ts`**

```typescript
import { getSupabase } from "@/lib/supabase";
import type { IntegrationToken } from "@/lib/types";
import { GOOGLE_PROVIDER } from "./google-config";

export async function getIntegrationToken(provider: string) {
  const supabase = getSupabase();
  const { data } = await supabase.from("integration_tokens").select("*").eq("provider", provider).maybeSingle();
  return (data as IntegrationToken | null) ?? null;
}

export async function saveIntegrationToken(row: Omit<IntegrationToken, "connected_at" | "last_sync_at"> & { last_sync_at?: string | null }) {
  const supabase = getSupabase();
  await supabase.from("integration_tokens").upsert({
    provider: row.provider,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    connected_at: new Date().toISOString(),
    last_sync_at: row.last_sync_at ?? null,
  });
}

export async function deleteIntegrationToken(provider: string) {
  const supabase = getSupabase();
  await supabase.from("integration_tokens").delete().eq("provider", provider);
}

export async function touchLastSync(provider: string) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("provider", provider);
}

export async function isGoogleConnected() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  return token != null;
}
```

- [ ] **Step 3: Create `lib/integrations/google-calendar/client.ts`**

```typescript
import { GOOGLE_CALENDAR_SCOPE } from "../google-config";
import type { GoogleEventsListResponse } from "./types";

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("token_refresh_failed");
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function fetchAllPrimaryEvents(accessToken: string) {
  const items = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`calendar_fetch_failed:${res.status}`);

    const data = (await res.json()) as GoogleEventsListResponse;
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}
```

- [ ] **Step 4: Create `lib/integrations/google-calendar/sync.ts`**

```typescript
import { getSupabase } from "@/lib/supabase";
import { GOOGLE_PROVIDER } from "../google-config";
import { getIntegrationToken, saveIntegrationToken, touchLastSync } from "../tokens";
import { refreshAccessToken, fetchAllPrimaryEvents } from "./client";
import { mapGoogleEvent } from "./map";
import { buildUpsertPayload, shouldRemoveLocal } from "./merge";

async function getValidAccessToken() {
  const row = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!row) throw new Error("not_connected");

  const expires = new Date(row.expires_at).getTime();
  if (Date.now() < expires - 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await saveIntegrationToken({
    provider: GOOGLE_PROVIDER,
    access_token: refreshed.access_token,
    refresh_token: row.refresh_token,
    expires_at,
    last_sync_at: row.last_sync_at,
  });
  return refreshed.access_token;
}

export async function syncGoogleCalendar(): Promise<{ imported: number; removed: number }> {
  const accessToken = await getValidAccessToken();
  const googleEvents = await fetchAllPrimaryEvents(accessToken);
  const supabase = getSupabase();

  const fetchedIds = new Set<string>();
  let imported = 0;

  for (const g of googleEvents) {
    const mapped = mapGoogleEvent(g);
    if (!mapped) continue;
    fetchedIds.add(mapped.google_event_id);

    const { data: existing } = await supabase
      .from("timeline_events")
      .select("title_override, description_override, hidden_at")
      .eq("google_event_id", mapped.google_event_id)
      .maybeSingle();

    if (existing?.hidden_at) continue;

    const payload = buildUpsertPayload(mapped, existing);
    const { error } = await supabase.from("timeline_events").upsert(payload, {
      onConflict: "google_event_id",
    });
    if (!error) imported++;
  }

  const { data: localGoogle } = await supabase
    .from("timeline_events")
    .select("id, source, google_event_id, title_override, description_override, hidden_at")
    .eq("source", "google_calendar");

  let removed = 0;
  for (const row of localGoogle ?? []) {
    if (shouldRemoveLocal(row, fetchedIds)) {
      await supabase.from("timeline_events").delete().eq("id", row.id);
      removed++;
    }
  }

  await touchLastSync(GOOGLE_PROVIDER);
  return { imported, removed };
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/google-config.ts lib/integrations/tokens.ts lib/integrations/google-calendar/client.ts lib/integrations/google-calendar/sync.ts
git commit -m "feat: add Google OAuth client and calendar sync orchestration"
```

---

### Task 7: OAuth API routes

**Files:**
- Create: `lib/integrations/oauth-state.ts`
- Create: `app/api/integrations/google/connect/route.ts`
- Create: `app/api/integrations/google/callback/route.ts`
- Create: `app/api/integrations/google/disconnect/route.ts`

- [ ] **Step 1: Create `lib/integrations/oauth-state.ts`**

```typescript
import { cookies } from "next/headers";

const COOKIE = "google_oauth_state";

export async function setOAuthState(state: string) {
  const jar = await cookies();
  jar.set(COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
}

export async function consumeOAuthState(expected: string) {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  return value === expected;
}
```

- [ ] **Step 2: Create connect route**

`app/api/integrations/google/connect/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/integrations/google-calendar/client";
import { googleConfigured } from "@/lib/integrations/google-config";
import { setOAuthState } from "@/lib/integrations/oauth-state";

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  const state = crypto.randomUUID();
  await setOAuthState(state);
  return NextResponse.redirect(googleAuthUrl(state));
}
```

- [ ] **Step 3: Create callback route**

`app/api/integrations/google/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/integrations/google-calendar/client";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthState } from "@/lib/integrations/oauth-state";
import { setFlash } from "@/lib/flash-actions";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const error = url.searchParams.get("error");
  if (error) {
    await setFlash("חיבור יומן גוגל בוטל", "error");
    return NextResponse.redirect(new URL("/settings", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    await setFlash("שגיאה בחיבור יומן גוגל", "error");
    return NextResponse.redirect(new URL("/settings", url.origin));
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw new Error("missing_refresh_token");

    await saveIntegrationToken({
      provider: GOOGLE_PROVIDER,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    const { imported } = await syncGoogleCalendar();
    await setFlash(`יומן גוגל מחובר — סונכרנו ${imported} אירועים`);
  } catch {
    await setFlash("שגיאה בחיבור יומן גוגל", "error");
  }

  return NextResponse.redirect(new URL("/settings", url.origin));
}
```

- [ ] **Step 4: Create disconnect route**

`app/api/integrations/google/disconnect/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { deleteIntegrationToken } from "@/lib/integrations/tokens";
import { setFlash } from "@/lib/flash-actions";

export async function POST() {
  await deleteIntegrationToken(GOOGLE_PROVIDER);
  await setFlash("נותק מיומן גוגל");
  return NextResponse.redirect(new URL("/settings", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), 303);
}
```

Note: For disconnect redirect in dev, use `headers().get("origin")` or redirect via form action instead.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/oauth-state.ts app/api/integrations/google/
git commit -m "feat: add Google Calendar OAuth connect and disconnect routes"
```

---

### Task 8: Sync API route and Vercel cron

**Files:**
- Create: `app/api/integrations/google/sync/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create sync route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { setFlash } from "@/lib/flash-actions";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    // Manual sync from authenticated session — allow same-origin POST from settings form
    // Rely on site password cookie already enforced by proxy/middleware
  }

  try {
    const { imported, removed } = await syncGoogleCalendar();
    if (!isCron) await setFlash(`יומן גוגל סונכרן — ${imported} אירועים`);
    return NextResponse.json({ ok: true, imported, removed });
  } catch (e) {
    if (!isCron) await setFlash("סנכרון נכשל — נסה שוב", "error");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update `vercel.json`**

```json
{
  "framework": "nextjs",
  "regions": ["syd1"],
  "crons": [
    {
      "path": "/api/integrations/google/sync",
      "schedule": "0 6 * * 0"
    }
  ]
}
```

Vercel cron sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` env var is set.

- [ ] **Step 3: Commit**

```bash
git add app/api/integrations/google/sync/route.ts vercel.json
git commit -m "feat: add Google Calendar sync endpoint and weekly cron"
```

---

### Task 9: Settings page

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/settings/actions.ts`
- Modify: `components/nav.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Create `app/settings/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { setFlash } from "@/lib/flash-actions";

export async function triggerGoogleSync() {
  try {
    const { imported } = await syncGoogleCalendar();
    await setFlash(`יומן גוגל סונכרן — ${imported} אירועים`);
  } catch {
    await setFlash("סנכרון נכשל — נסה שוב", "error");
  }
  revalidatePath("/settings");
  revalidatePath("/timeline");
  revalidatePath("/");
}
```

- [ ] **Step 2: Create `app/settings/page.tsx`**

Server component that:
- Checks `googleConfigured()` — show setup instructions if false (like `DbWarning` pattern)
- Checks `isGoogleConnected()` — show Connect link to `/api/integrations/google/connect` or Disconnect form + `triggerGoogleSync` form
- Shows `last_sync_at` from `integration_tokens`
- Counts `timeline_events` where `source = 'google_calendar'`
- Hebrew copy per design spec

- [ ] **Step 3: Add nav link**

In `components/nav.tsx`, add `{ href: "/settings", label: "הגדרות" }` before logout button.

- [ ] **Step 4: Update `.env.example`**

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
CRON_SECRET=
```

- [ ] **Step 5: Commit**

```bash
git add app/settings/ components/nav.tsx .env.example
git commit -m "feat: add settings page with Google Calendar connect and sync"
```

---

### Task 10: Timeline server actions (overrides + soft-hide)

**Files:**
- Modify: `app/timeline/actions.ts`

- [ ] **Step 1: Update `addTimelineEvent`** — set `source: 'manual'` explicitly on insert (optional, default handles it).

- [ ] **Step 2: Update `updateTimelineEvent`**

Load event first. If `source === 'google_calendar'`:
- Compare submitted title/description to current **display** values
- Write `title_override` / `description_override` only when different from synced `title`/`description`
- Do NOT overwrite synced `title`/`description` from form for google events — update dates via synced fields if user changes date (allowed)

```typescript
const { data: existing } = await supabase.from("timeline_events").select("*").eq("id", id).single();
if (!existing) { await setFlash("אירוע לא נמצא", "error"); return; }

if (existing.source === "google_calendar") {
  const { error } = await supabase.from("timeline_events").update({
    event_date,
    event_time,
    title_override: title !== existing.title ? title : existing.title_override,
    description_override:
      (description || null) !== (existing.description || null)
        ? (description || null)
        : existing.description_override,
  }).eq("id", id);
  // flash + revalidate
} else {
  // existing manual update logic
}
```

- [ ] **Step 3: Update `deleteTimelineEvent`**

```typescript
const { data: existing } = await supabase.from("timeline_events").select("source").eq("id", id).single();
if (existing?.source === "google_calendar") {
  await supabase.from("timeline_events").update({ hidden_at: new Date().toISOString() }).eq("id", id);
  await setFlash("האירוע הוסתר מהציר");
} else {
  await supabase.from("timeline_events").delete().eq("id", id);
  await setFlash("האירוע נמחק");
}
```

- [ ] **Step 4: Commit**

```bash
git add app/timeline/actions.ts
git commit -m "feat: support local overrides and soft-hide for calendar events"
```

---

### Task 11: Timeline UI

**Files:**
- Modify: `app/timeline/event-card.tsx`
- Modify: `app/timeline/event-edit-form.tsx`
- Create: `app/timeline/sync-bar.tsx`
- Modify: `app/timeline/page.tsx`
- Modify: `app/timeline/timeline-board.tsx` (if events filtered there)
- Modify: `lib/timeline-layout.ts` (use `displayTitle` in labels if needed)

- [ ] **Step 1: Filter hidden events in `app/timeline/page.tsx`**

```typescript
const visibleEvents = events.filter((e) => !e.hidden_at);
// pass visibleEvents to TimelineBoard
```

- [ ] **Step 2: Add calendar icon to `event-card.tsx`**

```typescript
import { Calendar } from "lucide-react";
import { displayTitle, displayDescription, isGoogleCalendarEvent } from "@/lib/timeline-display";

// In render:
{isGoogleCalendarEvent(event) && <Calendar size={14} className="text-muted" />}
<h3>{displayTitle(event)}</h3>
{displayDescription(event) && <p>{displayDescription(event)}</p>}
```

- [ ] **Step 3: Update `event-edit-form.tsx`**

- Default values use `displayTitle(event)` / `displayDescription(event)`
- Show hint when `isGoogleCalendarEvent(event)`: `שינוי מקומי בלבד — לא יתעדכן ביומן גוגל`
- Delete button text: `הסתרת אירוע` for google events

- [ ] **Step 4: Create `app/timeline/sync-bar.tsx`**

Client or server component showing:
- If connected: last sync relative time + form calling `triggerGoogleSync`
- If not: Link to `/settings`

- [ ] **Step 5: Add sync bar to timeline page above `TimelineBoard`**

- [ ] **Step 6: Update visual timeline labels** in `timeline-visual.tsx` / `timeline-parts.tsx` to use `displayTitle` and show calendar icon in tooltip where space allows.

- [ ] **Step 7: Commit**

```bash
git add app/timeline/ lib/timeline-layout.ts
git commit -m "feat: show calendar events with icon, overrides, and sync bar"
```

---

### Task 12: Relationships WhatsApp links

**Files:**
- Modify: `app/relationships/actions.ts`
- Modify: `app/relationships/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update `addRelationship` in `actions.ts`**

```typescript
import { normalizePhone } from "@/lib/integrations/phone";

const phoneRaw = String(formData.get("phone") || "").trim();
const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

await supabase.from("relationships").insert({
  // ...existing fields
  phone,
});
```

- [ ] **Step 2: Add `updateRelationshipPhone` action** (or include phone in notes form pattern)

- [ ] **Step 3: Update relationships page**

- Add phone input to add form
- On each card, when `whatsappUrl(r.phone)` is non-null:

```tsx
<a
  href={whatsappUrl(r.phone)!}
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-1 rounded-lg bg-good/15 px-2.5 py-1.5 text-xs font-medium text-good hover:bg-good/25"
>
  <MessageCircle size={13} /> פתיחת וואטסאפ
</a>
```

- [ ] **Step 4: Update home page overdue section**

Change query to include `phone`:
```typescript
supabase.from("relationships").select("id, name, last_contact_date, reminder_days, phone")
```

Render WhatsApp link next to name when valid.

- [ ] **Step 5: Commit**

```bash
git add app/relationships/ app/page.tsx
git commit -m "feat: add WhatsApp quick links on relationships"
```

---

### Task 13: SRS and documentation

**Files:**
- Modify: `docs/SSOT/SRS.md`
- Modify: `README.md`

- [ ] **Step 1: Add requirements FR-INT-GCAL-01 through FR-INT-WA-01** from design spec to `docs/SSOT/SRS.md`

- [ ] **Step 2: Add Google OAuth setup notes to README** (Google Cloud Console → OAuth client → redirect URI → env vars)

- [ ] **Step 3: Commit**

```bash
git add docs/SSOT/SRS.md README.md
git commit -m "docs: add integration requirements and Google OAuth setup"
```

---

### Task 14: Manual verification

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: no TypeScript errors

- [ ] **Step 3: Manual checklist** (from design spec)

Complete all items in `docs/superpowers/specs/2026-07-12-integrations-design.md` manual checklist.

- [ ] **Step 4: Final commit if any fixes**

```bash
git commit -m "fix: integration polish from manual testing"
```

---

## Spec coverage check

| Requirement | Task |
|---|---|
| FR-INT-GCAL-01 OAuth + full sync | Tasks 6–8 |
| FR-INT-GCAL-02 calendar icon | Task 11 |
| FR-INT-GCAL-03 local overrides | Tasks 5, 10, 11 |
| FR-INT-GCAL-04 manual + weekly sync | Tasks 8–9 |
| FR-INT-WA-01 phone + wa.me | Task 12 |
| Error toasts | Tasks 7–9 |
| Disconnect keeps events | Task 7 (no purge) |
| Hidden events excluded | Task 11 |
| SRS updated | Task 13 |

## Google Cloud setup (prerequisite)

1. Create project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Calendar API**
3. Create **OAuth 2.0 Client** (Web application)
4. Authorized redirect URI: `https://<your-domain>/api/integrations/google/callback` (+ localhost for dev)
5. Copy Client ID + Secret to Vercel env vars
