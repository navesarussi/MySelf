# Home Dashboard Polish + Device Contacts Import

**Date:** 2026-07-17  
**Status:** Approved (brainstorming)  
**Product surface:** Mobile app only (`mobile/`). Website UI is frozen.  
**Mapped SRS:** FR-HOME-01 (extend), FR-REL-PHONE (extend), new FR-REL-EMAIL, FR-REL-DEVICE-IMPORT (below)

## Summary

Polish the mobile home dashboard so each section shows actionable, time-relevant items, and add device-contacts import when creating a relationship (with a new `email` field).

Out of scope: website UI, two-way phone-book sync, bulk import, Google Contacts OAuth.

## Decisions

| Topic | Decision |
|---|---|
| Relationships on home | Show only due/overdue (`days_since_last_contact >= reminder_days`) |
| Task done control | Replace checkbox with small ״בוצע״ button at row start in RTL |
| Events mode | Prefer next 10 future events; if none in current calendar year → last 10 past |
| Events title | ״אירועים קרובים״ vs ״אירועים אחרונים״ based on mode |
| Library / goals cards | Tap opens existing FormModal CRUD (same as dedicated tabs) |
| Dreams | Same entity as goals (`goals` table) |
| Stats density | Shrink StatCards; expand from 4 → 8 without growing the stats block |
| Device contacts | Approach 2: immediate picker on create; cancel → empty form |
| Email | Nullable `relationships.email`; editable in form |
| Phone placeholder RTL | Fix LTR `textAlign` so Hebrew placeholder aligns to `textStart` |

## SRS additions

### FR-HOME-02 — Actionable home sections
Home relationships list shows only contacts due today or overdue. Home events show upcoming (or recent fallback). Library and goal cards on home support open/edit/delete via the same modals as their tabs.

### FR-HOME-03 — Dense smart stats
Home stats row(s) show at least 8 compact metrics (existing four plus urgency/progress metrics) without increasing the vertical footprint of the stats area beyond what denser cards require.

### FR-REL-EMAIL
Relationships may store an optional email address. Create/update APIs and the mobile form include the field.

### FR-REL-DEVICE-IMPORT
When creating a new relationship on mobile, the app offers the system contact picker after requesting permission. Selecting a contact pre-fills name, primary phone, and primary email; fields remain editable. Dismissing the picker or denying permission leaves an empty form. A secondary “import from contacts” control remains on the form.

## Architecture

```
mobile Home
  → GET /api/v1/home (events query adjusted; library body when needed for edit)
  → local filters: due relationships, compact stats
  → TaskCard: Done button
  → FormModals for goal / library entry (reuse patterns from goals.tsx / library.tsx)

mobile Relationships
  → create flow → request Contacts permission → Expo Contacts picker
  → map device contact → form fields (name, phone, email)
  → POST/PATCH /api/v1/relationships (+ email)

Supabase
  → migration: myself.relationships.email text null
```

## Home sections

### Relationships (due only)

A relationship is **due/overdue** when:

- `reminder_days` is not null, AND
- `last_contact_date` is null, OR calendar days since `last_contact_date` ≥ `reminder_days`

Home list renders only those rows (sorted overdue-first, then name). Empty copy when none.

### Tasks — Done button

In `mobile/src/components/task-card.tsx`:

- Remove `Checkbox`
- Add small `Btn` / pressable labeled `t("common.done")` on the start side of the row (RTL → visually left in Hebrew)
- Keep existing toggle behavior: done ↔ open via `onToggleDone`
- Status badge advance (if present) stays on the opposite side

### Events — upcoming vs recent

Home API (`app/api/v1/home/route.ts`) changes event selection:

1. Load candidate timeline events (exclude hidden if applicable).
2. `upcoming` = events with `event_date` (and time if present) ≥ now, ordered ascending, limit 10.
3. If `upcoming` is empty **for the current calendar year** (no event with `event_date` ≥ today and year(`event_date`) === current year), set mode = `recent` and return the 10 most recent past events (descending).
4. Otherwise mode = `upcoming` with those 10 future events (future events beyond the current year still count as upcoming if any exist *within* the year rule: if there is at least one upcoming event whose date falls in the current calendar year, show next 10 upcoming from now; if the only futures are in later years and none in the current year, still treat as “no upcoming in current year” → recent fallback).

Clarified rule (explicit):

- If there exists ≥1 event with `event_date >= today` and year = current year → return next 10 events with `event_date >= now` (any year), title key `home.upcomingEvents`.
- Else → return 10 most recent events with `event_date < now`, title key `home.recentEvents`.

Response shape addition:

```ts
eventsMode: "upcoming" | "recent";
recentEvents: TimelineEvent[]; // keep key for compatibility; content depends on mode
```

### Library + goals on home

- Goal cards: press → open goal FormModal (fields mirror `goals.tsx`); save/delete refresh home.
- Library cards: home currently selects `id, title, category, tags, updated_at` without `body`. Extend home library select to include `body` (or fetch-on-open) so edit modal works. Prefer including `body` in the limited home payload (max ~8–20 rows already).
- Reuse existing toast + mutate helpers.

### Compact stats (8)

Keep two wrapping rows; reduce StatCard `minWidth` (~100–110), title/main/sub font sizes, and padding so ~4 cards fit per row on typical phones.

| # | Metric | Main | Sub |
|---|---|---|---|
| 1 | Active habits | count | checked today / streaks |
| 2 | Overdue relationships | count | need attention / all ok |
| 3 | Active goals | count | achieved total |
| 4 | Open tasks | open+in_progress | in progress count |
| 5 | Habits pending today | count | not yet reported |
| 6 | Due soon tasks | count with due_date ≤ today+7 | open/in_progress only |
| 7 | Best active streak | max effective streak | among non-archived |
| 8 | Ready-to-act goals | count with achievabilityScore ≥ 3 | among active |

All cards remain pressable to the relevant tab.

## Device contacts import

### Dependency

- `expo-contacts` (and app.json / Info.plist / Android permission strings as required by Expo).

### Create flow

1. User taps add contact.
2. App requests contacts permission.
3. If granted → present contact picker (`Contacts.presentContactPickerAsync` or equivalent supported API).
4. On selection → map:
   - `name` ← display name / first+last
   - `phone` ← first phone number (normalized as stored today)
   - `email` ← first email address
5. Open FormModal with prefilled editable fields.
6. On cancel / deny → open FormModal empty (default project still selected).
7. Form always shows secondary control: “ייבוא מאנשי קשר” to re-run picker.

### Email field

- Migration: `alter table myself.relationships add column if not exists email text;`
- Types: `Relationship.email: string | null`
- API create/update accept `email`
- Form Input after phone; keyboard email-address
- Cards may show email as muted secondary text when present (optional, low priority)

### Phone placeholder alignment

- Do not force `textAlign: 'left'` / LTR on the whole Input when locale is Hebrew.
- Prefer: `writingDirection` / `textAlign: textStart` for empty+placeholder; once value is entered, LTR for digits is acceptable via `textAlign` only when `value.length > 0`, or use a dedicated LTR wrapper that does not flip placeholder alignment incorrectly.

## Error handling

- Contacts permission denied: silent fall-through to empty form (no blocking alert required; optional one-line toast).
- Picker unavailable / Expo Go limitation: fall-through to empty form + toast if needed.
- Home event query failure: existing ErrorNote.
- Relationship save validation: name + project required; email optional (no strict format gate beyond trim).

## Testing

- Unit: due/overdue filter; events mode selection (upcoming in year vs recent fallback); contact field mapping helper.
- Manual: Hebrew RTL Done button position; phone placeholder alignment; create contact with/without picker; home library/goal edit/delete.

## Files (expected touch set)

- `mobile/app/(tabs)/index.tsx` — filters, stats, modals, events title
- `mobile/src/components/task-card.tsx` — Done button
- `mobile/app/(tabs)/relationships.tsx` — email, picker flow, placeholder fix
- `mobile/src/api/resources.ts` — email + home `eventsMode`
- `app/api/v1/home/route.ts` — events selection + library body
- `app/api/v1/relationships/**` — email passthrough
- `lib/types.ts` — `email`
- `lib/i18n/messages.ts` — new strings
- `supabase/migrations/00xx_relationship_email.sql`
- `docs/SSOT/SRS.md` — FR-HOME-02/03, FR-REL-EMAIL, FR-REL-DEVICE-IMPORT

## Non-goals

- Website dashboard parity
- Syncing edits back to the device address book
- Importing multiple contacts at once
- Google Contacts API
