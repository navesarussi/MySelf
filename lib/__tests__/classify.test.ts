import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferTxnKind,
  isObviousBankFee,
  shouldSkipCategorizationPrompt,
} from "../finance/classify";

describe("inferTxnKind", () => {
  it("uses signed amount first", () => {
    assert.equal(inferTxnKind({ signedAmount: 3000, description: "עמלה" }), "income");
    assert.equal(inferTxnKind({ signedAmount: -12, description: "זיכוי" }), "expense");
  });

  it("uses Hebrew hints when no sign", () => {
    assert.equal(inferTxnKind({ description: "העברה דיגיטל" }), "income");
    assert.equal(inferTxnKind({ description: "עמלת קנ במטח" }), "expense");
  });

  it("Hebrew income hint wins over a stored expense kind", () => {
    assert.equal(inferTxnKind({ kind: "expense", description: "העברה דיגיטל" }), "income");
    assert.equal(inferTxnKind({ kind: "expense", description: "משכורת" }), "income");
  });

  it("falls back to explicit kind when text is ambiguous", () => {
    assert.equal(inferTxnKind({ kind: "income", description: "העברה כללית" }), "income");
  });
});

describe("bank ops", () => {
  it("detects fees", () => {
    assert.equal(isObviousBankFee("עמלת קנ במטח"), true);
    assert.equal(isObviousBankFee("סופר יודה"), false);
  });

  it("skips prompt for fees and salary-like income", () => {
    assert.equal(
      shouldSkipCategorizationPrompt({ description: "עמלה", kind: "expense" }),
      true
    );
    assert.equal(
      shouldSkipCategorizationPrompt({ description: "העברה דיגיטל", kind: "income" }),
      true
    );
    assert.equal(
      shouldSkipCategorizationPrompt({ description: "סופר יודה", kind: "expense" }),
      false
    );
  });
});
