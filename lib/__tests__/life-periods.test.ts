import assert from "node:assert/strict";
import {
  eventInPeriod,
  eventsForPeriod,
  isPeriodActiveToday,
  type LifePeriod,
} from "../life-periods";
import type { TimelineEvent } from "../types";

const base: LifePeriod = {
  id: "1",
  title: "צבא",
  start_date: "2021-12-23",
  end_date: "2025-04-19",
  parent_id: null,
  color: "#e2725b",
  kind: "period",
  sort_order: 1,
  created_at: "2026-01-01",
};

const relationship: LifePeriod = {
  ...base,
  id: "2",
  title: "זוגיות",
  start_date: "2023-07-26",
  end_date: null,
  kind: "relationship",
};

assert.equal(eventInPeriod("2023-08-01", base), true);
assert.equal(eventInPeriod("2023-08-01", relationship), true);
assert.equal(eventInPeriod("2020-01-01", base), false);
assert.equal(isPeriodActiveToday(relationship, "2026-07-11"), true);
assert.equal(isPeriodActiveToday(base, "2026-07-11"), false);

const events = [
  { id: "a", event_date: "2023-08-01", title: "x", description: null, category: null, created_at: "" },
  { id: "b", event_date: "2020-01-01", title: "y", description: null, category: null, created_at: "" },
] as TimelineEvent[];

assert.equal(eventsForPeriod(events, relationship).length, 1);
console.log("life-periods tests passed");
