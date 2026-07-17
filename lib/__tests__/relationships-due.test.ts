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
