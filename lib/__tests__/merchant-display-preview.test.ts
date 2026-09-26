import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDisplayMerchantName, meaningfulCharCount } from "../finance/merchant-display";

type PreviewCase = {
  in: string;
  equals?: string;
  notEquals?: string;
  contains?: string[];
  minChars?: number;
};

const FIXTURE = join(__dirname, "fixtures/merchant-display-preview.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as PreviewCase[];

describe("merchant display preview fixtures", () => {
  for (const [i, c] of cases.entries()) {
    it(`case ${i + 1}: ${c.in.slice(0, 48)}`, () => {
      const out = formatDisplayMerchantName(c.in);
      if (c.equals !== undefined) assert.equal(out, c.equals);
      if (c.notEquals !== undefined) assert.notEqual(out, c.notEquals);
      if (c.minChars !== undefined) assert.ok(meaningfulCharCount(out) >= c.minChars, out);
      for (const part of c.contains ?? []) {
        assert.match(out, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"), `${out} missing ${part}`);
      }
    });
  }
});
