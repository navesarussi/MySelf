import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingMatchesForRule, type PendingRow } from "../finance/apply-rule-pending";

const row = (id: string, merchant: string | null, extra: Partial<PendingRow> = {}): PendingRow => ({
  id,
  merchant,
  description: merchant ?? "",
  kind: "expense",
  purpose_note: null,
  ...extra,
});

describe("pendingMatchesForRule", () => {
  const rule = { merchant_key: "shufersal deal", kind: "expense" as const };

  it("matches the same merchant regardless of case and spacing", () => {
    const rows = [row("a", "SHUFERSAL  Deal"), row("b", "Shufersal deal"), row("c", "Rami Levy")];
    assert.deepEqual(pendingMatchesForRule(rows, rule).map((r) => r.id), ["a", "b"]);
  });

  it("excludes the transaction that created the rule", () => {
    const rows = [row("self", "Shufersal Deal"), row("other", "Shufersal Deal")];
    assert.deepEqual(pendingMatchesForRule(rows, rule, "self").map((r) => r.id), ["other"]);
  });

  it("falls back to the description when the merchant is empty", () => {
    const rows = [row("a", null, { description: "shufersal deal" })];
    assert.deepEqual(pendingMatchesForRule(rows, rule).map((r) => r.id), ["a"]);
  });

  it("does not apply an expense rule to income from the same name", () => {
    const rows = [row("refund", "Shufersal Deal", { kind: "income" })];
    assert.deepEqual(pendingMatchesForRule(rows, rule), []);
  });

  it("applies a rule without a kind to either kind", () => {
    const rows = [row("a", "Shufersal Deal", { kind: "income" }), row("b", "Shufersal Deal")];
    const anyKind = { merchant_key: "shufersal deal", kind: null };
    assert.deepEqual(pendingMatchesForRule(rows, anyKind).map((r) => r.id), ["a", "b"]);
  });
});
