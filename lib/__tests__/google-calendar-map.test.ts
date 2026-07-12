import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapGoogleEvent, minZoomForGoogleEvent } from "../integrations/google-calendar/map";
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
    assert.equal(row?.min_zoom, "hours");
    assert.equal(row?.category, "יומן");
    assert.equal(row?.source, "google_calendar");
  });

  it("maps all-day event", () => {
    const row = mapGoogleEvent(allDay);
    assert.equal(row?.event_date, "2026-07-20");
    assert.equal(row?.event_time, null);
    assert.equal(row?.min_zoom, "days");
  });

  it("returns null for cancelled", () => {
    assert.equal(mapGoogleEvent({ ...timed, status: "cancelled" }), null);
  });
});

describe("minZoomForGoogleEvent", () => {
  it("uses days for all-day events", () => {
    assert.equal(minZoomForGoogleEvent(allDay), "days");
  });

  it("uses hours for short timed events", () => {
    assert.equal(minZoomForGoogleEvent(timed), "hours");
  });

  it("uses days for timed events spanning 24h or more", () => {
    const long: GoogleCalendarEvent = {
      ...timed,
      end: { dateTime: "2026-07-16T10:30:00+03:00" },
    };
    assert.equal(minZoomForGoogleEvent(long), "days");
  });
});
