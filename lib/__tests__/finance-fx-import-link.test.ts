import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardChargeMatchesLeumiFx,
  fuzzyUsdRowMatches,
  inheritFromLeumiFxDebit,
  isCategorizedExpenseOfRecord,
  parseUsdFromFxNote,
  shouldSkipCalUsdForExistingFxDebit,
  shouldSkipForFuzzyUsdDuplicate,
  stableDedupeAmount,
  type FuzzyUsdRow,
  type LeumiFxDebitRow,
} from "../finance/fx-import-link";
import type { FinanceIngestInput } from "../finance/types";

function fxDebit(over: Partial<LeumiFxDebitRow> = {}): LeumiFxDebitRow {
  return {
    id: "fx-1",
    txn_date: "2026-06-15",
    amount: 365.5,
    category: "מנויים",
    purpose_note: "Anthropic $100",
    categorized_at: "2026-06-16T00:00:00.000Z",
    description: "המרת קנ במטח",
    merchant: null,
    is_internal: false,
    ...over,
  };
}

function calUsd(over: Partial<FinanceIngestInput> = {}): FinanceIngestInput {
  return {
    source: "visa_cal",
    txn_date: "2026-06-14",
    amount: 100,
    kind: "expense",
    currency: "USD",
    original_amount: 100,
    amount_ils: 365.5,
    card_name: "6601",
    description: "ANTHROPIC",
    ...over,
  };
}

describe("stableDedupeAmount", () => {
  it("uses original_amount for foreign currency", () => {
    assert.equal(stableDedupeAmount({ amount: 365.5, currency: "USD", original_amount: 100 }), 100);
  });

  it("uses ILS amount for ILS rows", () => {
    assert.equal(stableDedupeAmount({ amount: 42.5, currency: "ILS" }), 42.5);
  });
});

describe("parseUsdFromFxNote", () => {
  it("extracts USD face value from Leumi purpose note", () => {
    assert.equal(parseUsdFromFxNote("Anthropic $100"), 100);
    assert.equal(parseUsdFromFxNote("OpenAI $20.00 monthly"), 20);
  });

  it("returns null when note has no dollar amount", () => {
    assert.equal(parseUsdFromFxNote("מנוי חודשי"), null);
  });
});

describe("isCategorizedExpenseOfRecord", () => {
  it("is true for categorized Leumi FX debits", () => {
    assert.equal(isCategorizedExpenseOfRecord(fxDebit()), true);
  });

  it("is false for uncategorized FX debits", () => {
    assert.equal(
      isCategorizedExpenseOfRecord(fxDebit({ category: null, categorized_at: null, purpose_note: null })),
      false
    );
  });

  it("is false for internal FX debits", () => {
    assert.equal(isCategorizedExpenseOfRecord(fxDebit({ is_internal: true })), false);
  });
});

describe("cardChargeMatchesLeumiFx", () => {
  it("matches by USD amount in Leumi purpose note", () => {
    assert.equal(cardChargeMatchesLeumiFx(calUsd(), fxDebit()), true);
  });

  it("matches by ILS amount within tolerance", () => {
    assert.equal(
      cardChargeMatchesLeumiFx(calUsd({ original_amount: 100, amount_ils: 365.48 }), fxDebit()),
      true
    );
  });

  it("rejects when dates are too far apart", () => {
    assert.equal(cardChargeMatchesLeumiFx(calUsd({ txn_date: "2026-01-01" }), fxDebit()), false);
  });
});

describe("shouldSkipCalUsdForExistingFxDebit", () => {
  it("skips Cal USD when a categorized Leumi FX debit already owns the expense", () => {
    assert.equal(shouldSkipCalUsdForExistingFxDebit(calUsd(), [fxDebit()]), true);
  });

  it("does not skip when FX debit is uncategorized", () => {
    assert.equal(
      shouldSkipCalUsdForExistingFxDebit(
        calUsd(),
        [fxDebit({ category: null, categorized_at: null, purpose_note: null })]
      ),
      false
    );
  });

  it("ignores ILS card rows", () => {
    assert.equal(shouldSkipCalUsdForExistingFxDebit(calUsd({ currency: "ILS" }), [fxDebit()]), false);
  });
});

describe("fuzzyUsdRowMatches", () => {
  const legacy: FuzzyUsdRow = {
    id: "legacy-1",
    txn_date: "2025-11-03",
    card_name: "6601",
    account_number: null,
    currency: "USD",
    original_amount: 50,
    amount: 50,
  };

  it("matches same account + USD amount within date window despite date shift", () => {
    assert.equal(fuzzyUsdRowMatches(calUsd({ txn_date: "2025-11-06", original_amount: 50 }), legacy), true);
  });

  it("rejects when USD amount differs", () => {
    assert.equal(fuzzyUsdRowMatches(calUsd({ txn_date: "2025-11-04", original_amount: 51 }), legacy), false);
  });

  it("rejects when outside fuzzy date window", () => {
    assert.equal(fuzzyUsdRowMatches(calUsd({ txn_date: "2025-11-12", original_amount: 50 }), legacy), false);
  });
});

describe("shouldSkipForFuzzyUsdDuplicate", () => {
  it("skips re-import when legacy manual USD row exists", () => {
    const existing: FuzzyUsdRow = {
      id: "legacy-1",
      txn_date: "2026-03-01",
      card_name: "6601",
      account_number: null,
      currency: "USD",
      original_amount: 20,
      amount: 20,
    };
    assert.equal(
      shouldSkipForFuzzyUsdDuplicate(
        calUsd({ txn_date: "2026-03-03", original_amount: 20, amount: 20 }),
        [existing]
      ),
      true
    );
  });
});

describe("inheritFromLeumiFxDebit", () => {
  it("carries category and note from Leumi FX debit", () => {
    const inherited = inheritFromLeumiFxDebit(fxDebit());
    assert.equal(inherited.category, "מנויים");
    assert.equal(inherited.purpose_note, "Anthropic $100");
    assert.equal(inherited.needs_categorization, false);
  });
});
