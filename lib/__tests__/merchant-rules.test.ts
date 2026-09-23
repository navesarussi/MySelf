import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMerchantKey,
  matchMerchantRule,
  resolveExpenseType,
  type MerchantRule,
} from "../finance/merchant-rules";

describe("normalizeMerchantKey", () => {
  it("lowercases and collapses internal whitespace", () => {
    assert.equal(normalizeMerchantKey("   Netflix   IL  "), "netflix il");
  });

  it("normalizes glued Hebrew before keying", () => {
    assert.equal(
      normalizeMerchantKey("לאהוראתקבעברכבות"),
      normalizeMerchantKey("לא הוראת קבע ברכבות")
    );
  });

  it("handles null or empty", () => {
    assert.equal(normalizeMerchantKey(null), "");
    assert.equal(normalizeMerchantKey("   "), "");
  });
});

describe("matchMerchantRule", () => {
  const rules: MerchantRule[] = [
    {
      merchant_key: "netflix",
      category: "מנויים",
      expense_type: "fixed",
      kind: "expense",
      default_note: "סטרימינג",
    },
    {
      merchant_key: "am:pm",
      category: "מזון",
      expense_type: "variable",
      kind: "expense",
      default_note: null,
    },
  ];

  it("matches merchant by key", () => {
    const match = matchMerchantRule("Netflix", null, rules);
    assert.equal(match?.merchant_key, "netflix");
    assert.equal(match?.expense_type, "fixed");
  });

  it("matches description when merchant is missing", () => {
    const match = matchMerchantRule(null, "AM:PM דיזנגוף", [
      ...rules,
      {
        merchant_key: "am:pm דיזנגוף",
        category: "מזון",
        expense_type: "variable",
        kind: "expense",
        default_note: null,
      },
    ]);
    assert.equal(match?.category, "מזון");
  });

  it("works with Map", () => {
    const map = new Map<string, MerchantRule>();
    rules.forEach((r) => map.set(r.merchant_key, r));
    const match = matchMerchantRule("netflix", null, map);
    assert.equal(match?.expense_type, "fixed");
  });

  it("returns null when no rule matches", () => {
    assert.equal(matchMerchantRule("Unknown", "Desc", rules), null);
  });
});

describe("resolveExpenseType", () => {
  const rules: MerchantRule[] = [
    {
      merchant_key: "netflix",
      category: "מזון",
      expense_type: "fixed",
      kind: "expense",
      default_note: null,
    },
    {
      merchant_key: "arnona",
      category: "בית",
      expense_type: "variable",
      kind: "expense",
      default_note: null,
    },
  ];

  it("returns income for income kind", () => {
    assert.equal(
      resolveExpenseType({ kind: "income", category: "משכורת", explicitExpenseType: "fixed" }),
      "income"
    );
  });

  it("prefers explicitExpenseType over rules and category", () => {
    assert.equal(
      resolveExpenseType({
        merchant: "netflix",
        category: "בית",
        explicitExpenseType: "variable",
        rules,
      }),
      "variable"
    );
  });

  it("uses matched rule expense_type over category default", () => {
    // "מזון" is normally variable, but netflix rule specifies fixed
    assert.equal(
      resolveExpenseType({
        merchant: "Netflix",
        category: "מזון",
        rules,
      }),
      "fixed"
    );

    // "בית" is normally fixed, but arnona rule specifies variable
    assert.equal(
      resolveExpenseType({
        merchant: "arnona",
        category: "בית",
        rules,
      }),
      "variable"
    );
  });

  it("uses direct rule if passed", () => {
    assert.equal(
      resolveExpenseType({
        category: "מזון",
        rule: { expense_type: "fixed" },
      }),
      "fixed"
    );
  });

  it("falls back to category default if no rule or explicit type", () => {
    assert.equal(resolveExpenseType({ category: "בית" }), "fixed");
    assert.equal(resolveExpenseType({ category: "מזון" }), "variable");
    assert.equal(resolveExpenseType({ category: "בילויים" }), "variable");
  });
});
