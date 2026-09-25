import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCalStatementPdf } from "../finance/import/parse-cal-pdf";
import { normalizeParsedForeignAmounts } from "../finance/import/foreign-amount";

type UsdFixture = {
  id: string;
  text: string;
  expectSkip?: boolean;
  expect?: {
    date: string;
    original_amount: number;
    merchant: string;
    kind: "income" | "expense";
  };
  expectIls?: {
    date: string;
    amount: number;
    merchant: string;
    kind: "income" | "expense";
  };
};

const fixtures: UsdFixture[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures/cal-usd-truth-fixtures.json"), "utf8")
);

function parseUsd(text: string) {
  const result = parseCalStatementPdf(text);
  return normalizeParsedForeignAmounts(
    result.transactions.filter((t) => (t.currency ?? "ILS") !== "ILS" || t.raw?.pattern === "fx_row")
  );
}

function merchantMatches(actual: string | null | undefined, expected: string): boolean {
  const a = (actual ?? "").toUpperCase();
  const e = expected.toUpperCase();
  return a.includes(e) || e.includes(a.replace(/[^A-Z0-9]/g, "").slice(0, 4));
}

describe("Cal USD truth regression fixtures", () => {
  for (const fx of fixtures) {
    it(fx.id, () => {
      const rows = parseUsd(fx.text);
      if (fx.expectSkip) {
        assert.equal(rows.length, 0, `expected skip, got ${JSON.stringify(rows)}`);
        return;
      }
      if (fx.expectIls) {
        const result = parseCalStatementPdf(fx.text);
        const ils = result.transactions.find((t) => t.currency === "ILS");
        assert.ok(ils, `expected ILS row in ${JSON.stringify(result.transactions)}`);
        assert.equal(ils?.booked_at, fx.expectIls.date);
        assert.equal(ils?.amount, fx.expectIls.amount);
        assert.equal(ils?.kind, fx.expectIls.kind);
        assert.ok(merchantMatches(ils?.merchant, fx.expectIls.merchant));
        return;
      }
      assert.ok(fx.expect, "fixture missing expect");
      assert.equal(rows.length, 1, JSON.stringify(rows));
      const row = rows[0];
      assert.equal(row.booked_at, fx.expect.date, fx.id);
      assert.equal(row.original_amount, fx.expect.original_amount, fx.id);
      assert.equal(row.kind, fx.expect.kind, fx.id);
      assert.ok(merchantMatches(row.merchant, fx.expect.merchant), `${row.merchant} vs ${fx.expect.merchant}`);
      assert.ok(row.amount > 0, "ILS amount should be positive");
      assert.notEqual(row.currency, "ILS");
    });
  }
});

describe("Cal USD truth CSV coverage", () => {
  it("parses all anonymized USD truth fixtures (30 charge rows + skip 1 info line)", () => {
    const usdFixtures = fixtures.filter((f) => f.expect);
    assert.ok(usdFixtures.length >= 14);
    for (const fx of usdFixtures) {
      const rows = parseUsd(fx.text);
      assert.equal(rows.length, 1, fx.id);
    }
  });
});
