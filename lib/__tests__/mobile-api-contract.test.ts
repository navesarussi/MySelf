import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOME_TRADING_LEGACY_FIELDS } from "../home-snapshots";
import { MOBILE_API_CONTRACTS, assertHomeTradingLegacyFields } from "../api-contracts/schemas";
import { validateMobileApiContract } from "../api-contracts/validate";
import {
  financePlanFixture,
  goalsFixture,
  habitsFixture,
  homeFixture,
  relationshipsFixture,
  tasksFixture,
  tradingDashboardFixture,
  tradingEquityFixture,
} from "../api-contracts/fixtures";
import { evaluateContractResponse } from "../api-contracts/validate";
import { evaluateSmokeResponse, smokeEndpoints } from "../ops/smoke";

describe("mobile API contract fixtures", () => {
  const cases: [keyof typeof MOBILE_API_CONTRACTS, unknown][] = [
    ["home", homeFixture],
    ["tasks", tasksFixture],
    ["habits", habitsFixture],
    ["goals", goalsFixture],
    ["financePlan", financePlanFixture],
    ["relationships", relationshipsFixture],
    ["tradingEquity", tradingEquityFixture],
    ["tradingDashboard", tradingDashboardFixture],
  ];

  for (const [key, fixture] of cases) {
    it(`validates ${MOBILE_API_CONTRACTS[key].path}`, () => {
      assert.equal(validateMobileApiContract(key, fixture), null);
    });
  }
});

describe("home trading backward compatibility", () => {
  it("requires legacy trading fields older mobile builds read", () => {
    for (const key of HOME_TRADING_LEGACY_FIELDS) {
      assert.ok(key in (homeFixture.trading ?? {}), `fixture missing ${key}`);
    }
    assert.equal(assertHomeTradingLegacyFields(homeFixture.trading), null);
  });

  it("fails when a legacy trading field is removed", () => {
    const broken = { ...homeFixture.trading!, equity: 1 };
    delete (broken as { phase?: string }).phase;
    assert.match(assertHomeTradingLegacyFields(broken) ?? "", /missing_trading_field:phase/);
    assert.notEqual(validateMobileApiContract("home", { ...homeFixture, trading: broken })?.reason, undefined);
  });

  it("allows null trading for non-primary accounts", () => {
    assert.equal(assertHomeTradingLegacyFields(null), null);
    assert.equal(validateMobileApiContract("home", { ...homeFixture, trading: null }), null);
  });
});

describe("smoke + contract integration", () => {
  it("includes trading equity and relationships endpoints", () => {
    const paths = smokeEndpoints(new Date("2026-09-25T12:00:00Z"));
    assert.ok(paths.includes("/api/v1/trading/equity"));
    assert.ok(paths.includes("/api/v1/relationships"));
  });

  it("combines degraded checks with schema validation", () => {
    assert.equal(evaluateSmokeResponse(200, JSON.stringify(homeFixture)), null);
    const body = JSON.stringify({ ...homeFixture, trading: { equity: 1 } });
    assert.match(evaluateContractResponse("/api/v1/home", 200, body) ?? "", /missing_trading_field|schema:/);
  });
});
