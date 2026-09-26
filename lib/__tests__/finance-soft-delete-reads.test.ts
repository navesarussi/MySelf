import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Regression: user-facing finance reads must exclude soft-deleted transactions. */
const READ_PATHS = [
  "lib/finance/apply-rule-pending.ts",
  "lib/finance/merchant-category.ts",
  "lib/finance/category-list.ts",
  "lib/finance/sources-status.ts",
  "lib/finance/txn-range.ts",
  "app/api/v1/home/route.ts",
  "lib/finance/import/run-import.ts",
  "app/api/v1/finance/transactions/route.ts",
];

describe("finance soft-delete read filters", () => {
  for (const rel of READ_PATHS) {
    it(`${rel} filters deleted_at on finance_transactions reads`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      assert.match(
        src,
        /from\("finance_transactions"\)[\s\S]*?\.is\("deleted_at", null\)/,
        `expected .is("deleted_at", null) after finance_transactions query in ${rel}`
      );
    });
  }
});
