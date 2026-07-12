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
