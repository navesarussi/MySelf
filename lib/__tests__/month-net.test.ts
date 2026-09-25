import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthNet } from "../finance/month-net";

describe("monthNet", () => {
  it("is income minus expense, to the agora", () => {
    assert.equal(
      monthNet([
        { kind: "income", amount: 10000 },
        { kind: "expense", amount: "2500.10" },
        { kind: "expense", amount: 0.2 },
      ]),
      7499.7
    );
  });

  it("ignores other kinds and missing amounts", () => {
    assert.equal(monthNet([{ kind: "transfer", amount: 999 }, { kind: "income", amount: null }]), 0);
  });

  it("is zero for an empty month", () => {
    assert.equal(monthNet([]), 0);
  });
});
