import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchExistingWealthItem, wealthItemKey } from "../finance/wealth-match";
import type { WealthItem } from "../finance/wealth-types";

function item(partial: Partial<WealthItem> & Pick<WealthItem, "id" | "category" | "name">): WealthItem {
  return {
    provider: null,
    balance: 0,
    currency: "ILS",
    notes: null,
    source: "manual",
    as_of_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("wealthItemKey", () => {
  it("ignores case, surrounding space and inner run length", () => {
    assert.equal(
      wealthItemKey({ category: "pension", name: "  Menora   Mivtachim ", provider: "מנורה" }),
      wealthItemKey({ category: "pension", name: "menora mivtachim", provider: " מנורה " })
    );
  });

  it("separates different categories, names and providers", () => {
    const base = { category: "pension" as const, name: "קרן", provider: "מנורה" };
    assert.notEqual(wealthItemKey(base), wealthItemKey({ ...base, category: "insurance" }));
    assert.notEqual(wealthItemKey(base), wealthItemKey({ ...base, name: "קרן ב" }));
    assert.notEqual(wealthItemKey(base), wealthItemKey({ ...base, provider: "הראל" }));
  });

  it("treats a missing provider as its own value, not as a wildcard", () => {
    assert.notEqual(
      wealthItemKey({ category: "pension", name: "קרן", provider: null }),
      wealthItemKey({ category: "pension", name: "קרן", provider: "מנורה" })
    );
  });
});

/**
 * `import_wealth_text` parses a pasted Cover / הר הביטוח snapshot and wrote
 * every line as a new row — the parser deduplicates within one paste, but
 * nothing deduplicated across pastes and the table has no unique constraint.
 * Pasting the same snapshot twice, or the agent retrying after a timeout,
 * therefore doubled the reported net worth.
 */
describe("matchExistingWealthItem", () => {
  const existing: WealthItem[] = [
    item({ id: "a", category: "pension", name: "קרן פנסיה", provider: "מנורה", balance: 100 }),
    item({ id: "b", category: "insurance", name: "ביטוח חיים", provider: "הראל", balance: 50 }),
    item({ id: "c", category: "pension", name: "קרן פנסיה", provider: "הראל", balance: 70 }),
  ];

  it("re-importing the same snapshot updates rather than duplicates", () => {
    const match = matchExistingWealthItem(existing, {
      category: "pension",
      name: "קרן פנסיה",
      provider: "מנורה",
    });
    assert.equal(match?.id, "a");
  });

  it("matches despite case and spacing differences in the paste", () => {
    const match = matchExistingWealthItem(existing, {
      category: "insurance",
      name: "  ביטוח   חיים  ",
      provider: "הראל",
    });
    assert.equal(match?.id, "b");
  });

  it("keeps two same-named items from different providers apart", () => {
    assert.equal(
      matchExistingWealthItem(existing, { category: "pension", name: "קרן פנסיה", provider: "הראל" })?.id,
      "c"
    );
  });

  it("returns null for something genuinely new", () => {
    assert.equal(
      matchExistingWealthItem(existing, { category: "property", name: "דירה", provider: null }),
      null
    );
    assert.equal(
      matchExistingWealthItem(existing, { category: "pension", name: "קרן פנסיה", provider: null }),
      null,
      "a provider-less line must not silently take over a provider's row"
    );
  });

  it("picks the most recently updated row when the data already holds duplicates", () => {
    const dupes: WealthItem[] = [
      item({ id: "old", category: "other", name: "x", updated_at: "2026-01-01T00:00:00.000Z" }),
      item({ id: "new", category: "other", name: "x", updated_at: "2026-06-01T00:00:00.000Z" }),
    ];
    assert.equal(matchExistingWealthItem(dupes, { category: "other", name: "x", provider: null })?.id, "new");
  });
});
