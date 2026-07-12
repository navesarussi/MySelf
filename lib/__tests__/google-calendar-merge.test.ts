import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildUpsertPayload, shouldRemoveLocal } from "../integrations/google-calendar/merge";

describe("buildUpsertPayload", () => {
  it("uses mapped fields on insert", () => {
    const payload = buildUpsertPayload(
      {
        google_event_id: "g1",
        title: "A",
        description: null,
        event_date: "2026-01-01",
        event_time: null,
        category: "יומן",
        source: "google_calendar",
      },
      null
    );
    assert.equal(payload.title, "A");
    assert.equal(payload.title_override, undefined);
  });

  it("preserves overrides on update", () => {
    const payload = buildUpsertPayload(
      {
        google_event_id: "g1",
        title: "New",
        description: "D",
        event_date: "2026-01-01",
        event_time: null,
        category: "יומן",
        source: "google_calendar",
      },
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
      shouldRemoveLocal(
        {
          source: "google_calendar",
          google_event_id: "gone",
          title_override: null,
          description_override: null,
          hidden_at: null,
        },
        new Set(["keep"])
      ),
      true
    );
  });

  it("keeps events with overrides", () => {
    assert.equal(
      shouldRemoveLocal(
        {
          source: "google_calendar",
          google_event_id: "gone",
          title_override: "x",
          description_override: null,
          hidden_at: null,
        },
        new Set()
      ),
      false
    );
  });

  it("keeps hidden events", () => {
    assert.equal(
      shouldRemoveLocal(
        {
          source: "google_calendar",
          google_event_id: "gone",
          title_override: null,
          description_override: null,
          hidden_at: "2026-01-01",
        },
        new Set()
      ),
      false
    );
  });
});
