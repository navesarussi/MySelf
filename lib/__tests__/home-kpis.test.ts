import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHomeKpis, homeHeroCount, type HomeKpiInput } from "../home-kpis";

const base: HomeKpiInput = {
  habitsCount: 4,
  dueRelationships: 2,
  activeGoals: 3,
  openTasks: 9,
  habitsPending: 2,
  habitsOverdue: 1,
  tasksDueSoon: 3,
  doneTasks: 42,
  avgTaskCloseDays: 3.5,
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
    assert.equal(
      homeHeroCount({ habitsOverdue: 0, dueRelationships: 0, tasksDueSoon: 0, financeUncategorized: 0 }),
      0
    );
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
