# Integrations Design — Google Calendar & WhatsApp Links

**Date:** 2026-07-12  
**Status:** Approved (brainstorming)  
**Mapped SRS additions:** FR-INT-GCAL-01–04, FR-INT-WA-01

## Summary

Add two integrations to MySelf:

1. **Google Calendar** — one-way sync of the user's primary calendar into `timeline_events`, displayed like regular events with a calendar icon. Local title/description overrides allowed; Google remains source of truth for synced fields.
2. **WhatsApp quick links** — optional phone number on relationships with a `wa.me` deep link. No message auto-detection (WhatsApp Business app has no API for personal chats).

## Decisions

| Topic | Decision |
|---|---|
| Calendar direction | Google → MySelf (one-way) |
| Calendar scope | Primary calendar only, full history |
| Calendar display | Same as manual events + calendar icon, category `יומן` |
| Calendar edits | Local overrides only (Option B); no Google API writes |
| Sync triggers | Manual "Sync now" + weekly Vercel Cron |
| WhatsApp | V1: phone field + `wa.me` link + existing "Contacted today" |
| WhatsApp automation | Out of scope V1; V1.5 may add phone shortcuts |
| Architecture | Approach 1 — extend existing tables |

## Data Model

### `timeline_events` — new columns

| Column | Type | Purpose |
|---|---|---|
| `source` | `text` | `'manual'` (default) or `'google_calendar'` |
| `google_event_id` | `text` | Google event ID; unique when not null |
| `title_override` | `text` | Local title edit (null = use synced title) |
| `description_override` | `text` | Local description edit |
| `hidden_at` | `timestamptz` | Soft-hide calendar events locally |
| `synced_at` | `timestamptz` | Last sync update from Google |

Unique partial index on `google_event_id` where not null.

Display helpers:
- `displayTitle = title_override ?? title`
- `displayDescription = description_override ?? description`

### `relationships` — new column

| Column | Type | Purpose |
|---|---|---|
| `phone` | `text` | Optional; normalized for `wa.me/{phone}` link |

### `integration_tokens` — new table

| Column | Type | Purpose |
|---|---|---|
| `provider` | `text` | `'google_calendar'` |
| `access_token` | `text` | Server-only |
| `refresh_token` | `text` | Token renewal |
| `expires_at` | `timestamptz` | Access token expiry |
| `connected_at` | `timestamptz` | Connection timestamp |
| `last_sync_at` | `timestamptz` | Last successful sync |

Single-user app: one row per provider.

### Environment variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Callback URL (e.g. `/api/integrations/google/callback`) |
| `CRON_SECRET` | Protects weekly sync cron endpoint |

## Google Calendar Sync Flow

### OAuth connect

1. User opens `/settings`, clicks **Connect Google Calendar**.
2. Redirect to Google OAuth with scope `https://www.googleapis.com/auth/calendar.readonly`.
3. Callback at `/api/integrations/google/callback` exchanges code for tokens.
4. Store tokens in `integration_tokens`.
5. Trigger initial full sync.

OAuth `state` param required for CSRF protection.

### Sync algorithm

Triggered by: initial connect, "Sync now" button, weekly cron (`POST /api/integrations/google/sync` with `CRON_SECRET` header).

```
1. Load tokens; refresh access_token if expired
2. GET calendars/primary/events (singleEvents=true, orderBy=startTime, paginate all pages)
3. For each event:
   - Skip cancelled
   - Map id, summary, description, start → event_date + event_time
   - UPSERT by google_event_id
   - On update: refresh title/description UNLESS override columns set
   - Skip rows with hidden_at set
4. Delete google_calendar rows whose google_event_id not in fetched set (no overrides, not hidden)
5. Update last_sync_at
```

### Field mapping

| Google | `timeline_events` |
|---|---|
| `id` | `google_event_id` |
| `summary` | `title` |
| `description` | `description` |
| `start.dateTime` | `event_date` + `event_time` |
| `start.date` (all-day) | `event_date`, `event_time = null` |
| — | `category = 'יומן'` |
| — | `source = 'google_calendar'` |

Recurring events: expanded via `singleEvents=true` (one row per instance).

### Local edit rules

- Edit saves to `title_override` / `description_override` only.
- Delete on calendar event sets `hidden_at` (soft-hide).
- Manual events (`source = 'manual'`) unchanged.
- UI hint: "שינוי מקומי בלבד — לא יתעדכן ביומן גוגל"

### Disconnect behavior

- Clear tokens from `integration_tokens`.
- Keep imported calendar events in timeline (do not purge).

## UI Changes

### Timeline

- Calendar icon (lucide `Calendar`) on calendar-sourced events in list, visual, and accordion views.
- Sync status + "Sync now" when connected; link to settings when not.
- Edit form respects override columns for calendar events.

### Settings (`/settings`)

- Google Calendar connect/disconnect.
- Connected status, last sync time, imported event count.
- "Sync now" button.
- Note about weekly auto-sync.

### Relationships

- Optional `phone` field on add/edit forms.
- WhatsApp button (`wa.me`) when phone is valid; opens in new tab.
- Home dashboard: WhatsApp link on overdue contacts when phone exists.

### Navigation

- Add **הגדרות** link to nav.

## Error Handling

| Scenario | Behavior |
|---|---|
| OAuth denied | Toast: "חיבור יומן גוגל בוטל" |
| Token refresh fails | Banner: reconnect required |
| Missing Google env vars | Setup instructions on settings page |
| Google 429 | Retry once; toast error if still failing |
| Network timeout | Toast error; `last_sync_at` unchanged |
| Invalid cron secret | 401, no sync |
| Invalid phone | Save allowed; WhatsApp button hidden |

Toasts follow existing `FR-TOAST-01` pattern.

## Security

- Tokens server-side only; never sent to client.
- Cron protected by `CRON_SECRET`.
- OAuth state param for CSRF.
- Read-only Google scope for V1.

## File Structure

```
lib/integrations/
  google-calendar/
    client.ts
    sync.ts
    types.ts
  phone.ts
app/settings/
  page.tsx
app/api/integrations/google/
  connect/route.ts
  callback/route.ts
  sync/route.ts
  disconnect/route.ts
supabase/migrations/
  0006_integrations.sql
lib/__tests__/
  google-calendar-sync.test.ts
  phone.test.ts
```

## Testing

### Unit tests

- `google-calendar-sync.test.ts` — mapping, override merge, cancelled skip, removal on Google delete
- `phone.test.ts` — Israeli number normalization → `wa.me` URL

### Manual checklist

- [ ] Connect Google → initial sync imports events
- [ ] Calendar icon on all timeline views
- [ ] Local edit persists after re-sync
- [ ] Google delete removes event on next sync
- [ ] Disconnect clears tokens; events remain
- [ ] Phone + WhatsApp button opens correct chat
- [ ] "Contacted today" still works
- [ ] Cron endpoint works with secret
- [ ] Home shows overdue + WhatsApp link

## SRS Requirements (to add)

### FR-INT-GCAL-01
Connect primary Google Calendar via OAuth; sync all historical and future events to timeline.

### FR-INT-GCAL-02
Calendar-sourced events display with a calendar icon and category `יומן`, indistinguishable from manual events except for the indicator.

### FR-INT-GCAL-03
User may set local title/description overrides on calendar events; re-sync preserves overrides.

### FR-INT-GCAL-04
Manual sync on demand plus weekly automatic background sync.

### FR-INT-WA-01
Optional phone number on relationships; when set, show WhatsApp quick-link via `wa.me`.

## Out of Scope (V1)

- Two-way Google Calendar sync
- WhatsApp message auto-detection
- Google Contacts import
- Multiple calendar selection
- Phone shortcut semi-automation (deferred to V1.5)

## Estimated Effort

| Piece | Days |
|---|---|
| Google OAuth + token storage | 1 |
| Sync logic + cron | 1.5 |
| Timeline UI (icon, overrides, sync button) | 1 |
| Settings page | 0.5 |
| Relationships phone + WhatsApp | 0.5 |
| Tests + polish | 1 |
| **Total** | **~5–6 days** |
