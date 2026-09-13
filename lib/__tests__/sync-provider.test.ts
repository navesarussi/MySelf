import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompanyTypes } from "@sergienko4/israeli-bank-scrapers";
import {
  formatScraperDate,
  mapScraperTxn,
  resolveCompanyId,
} from "../../scripts/finance/sync-provider";

describe("sync-provider", () => {
  describe("resolveCompanyId", () => {
    it("resolves leumi correctly", () => {
      assert.equal(resolveCompanyId("leumi"), CompanyTypes.Leumi);
    });

    it("resolves max correctly", () => {
      assert.equal(resolveCompanyId("max"), CompanyTypes.Max);
    });

    it("resolves visa_cal / cal correctly", () => {
      assert.equal(resolveCompanyId("visa_cal"), CompanyTypes.VisaCal);
      assert.equal(resolveCompanyId("visaCal"), CompanyTypes.VisaCal);
      assert.equal(resolveCompanyId("cal"), CompanyTypes.VisaCal);
    });

    it("keeps enum value intact", () => {
      assert.equal(resolveCompanyId(CompanyTypes.Max), CompanyTypes.Max);
    });
  });

  describe("formatScraperDate", () => {
    it("preserves YYYY-MM-DD", () => {
      assert.equal(formatScraperDate("2026-09-13"), "2026-09-13");
    });

    it("converts ISO instant using Asia/Jerusalem calendar date", () => {
      // 21:30 UTC on June 28 is June 29 in Asia/Jerusalem (UTC+3)
      assert.equal(formatScraperDate("2026-06-28T21:30:00.000Z"), "2026-06-29");
    });

    it("throws on invalid date", () => {
      assert.throws(() => formatScraperDate("invalid"), /invalid_date/);
    });
  });

  describe("mapScraperTxn", () => {
    it("maps debit transaction to expense with positive amount", () => {
      const mapped = mapScraperTxn(
        "1234",
        {
          date: "2026-09-10",
          chargedAmount: -150.5,
          description: "שופרסל",
          identifier: "tx-789",
        },
        { source: "max", card_name: "MAX" }
      );

      assert.ok(mapped);
      assert.equal(mapped.source, "max");
      assert.equal(mapped.card_name, "MAX");
      assert.equal(mapped.account_number, "1234");
      assert.equal(mapped.identifier, "tx-789");
      assert.equal(mapped.amount, 150.5);
      assert.equal(mapped.kind, "expense");
      assert.equal(mapped.description, "שופרסל");
      assert.equal(mapped.merchant, "שופרסל");
      assert.equal(mapped.txn_date, "2026-09-10");
    });

    it("maps credit transaction to income", () => {
      const mapped = mapScraperTxn(
        "5678",
        {
          date: "2026-09-11",
          chargedAmount: 200,
          description: "זיכוי שופרסל",
          identifier: 42,
        },
        { source: "visa_cal", card_name: "Cal" }
      );

      assert.ok(mapped);
      assert.equal(mapped.source, "visa_cal");
      assert.equal(mapped.card_name, "Cal");
      assert.equal(mapped.account_number, "5678");
      assert.equal(mapped.identifier, "42");
      assert.equal(mapped.amount, 200);
      assert.equal(mapped.kind, "income");
    });

    it("returns null for zero amount", () => {
      const mapped = mapScraperTxn(
        "1234",
        {
          date: "2026-09-10",
          chargedAmount: 0,
          description: "בדיקה",
        },
        { source: "max" }
      );
      assert.equal(mapped, null);
    });
  });
});
