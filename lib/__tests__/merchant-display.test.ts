import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatDisplayMerchantName,
  normalizeStoredMerchantFields,
  pickDisplayMerchantLabel,
} from "../finance/merchant-display";

describe("formatDisplayMerchantName", () => {
  it("maps known international merchants", () => {
    assert.equal(formatDisplayMerchantName("google cloud wfv8mm sydney au"), "Google Cloud");
    assert.equal(formatDisplayMerchantName("cursor, ai powered ide cursor.com us"), "Cursor");
    assert.equal(formatDisplayMerchantName("www.hostinger.com larnaca cy"), "Hostinger");
    assert.equal(formatDisplayMerchantName("wix.com 1248411163 luxembourg lu"), "Wix");
  });

  it("strips Cal standing-order prefix from Hebrew display", () => {
    assert.equal(
      formatDisplayMerchantName("לאהוראתקבעעמותותותרלובי"),
      "לובי"
    );
    assert.equal(
      formatDisplayMerchantName("לא הוראת קבע ריהוט בית גו אה"),
      "בית גו אה"
    );
  });

  it("segments glued Hebrew merchant names", () => {
    const out = formatDisplayMerchantName("פנאיבילוימשתלהסיטונאית");
    assert.match(out, /פנאי/);
    assert.match(out, /משתלה/);
  });

  it("preserves raw descriptor when requested", () => {
    const raw = formatDisplayMerchantName("google cloud wfv8mm sydney au", { raw: true });
    assert.match(raw, /google cloud/i);
  });
});

describe("pickDisplayMerchantLabel", () => {
  it("prefers clean label over OCR garbage", () => {
    assert.equal(
      pickDisplayMerchantLabel("לאהוראתקבעלובי", "לובי 99"),
      "לובי 99"
    );
  });
});

describe("normalizeStoredMerchantFields", () => {
  it("cleans merchant_key and display_name for migration", () => {
    const out = normalizeStoredMerchantFields({
      merchant_key: "לאהוראתקבענטפליקס",
      display_name: "לא הוראת קבע נטפליקס",
    });
    assert.equal(out.merchant_key, "נטפליקס");
    assert.equal(out.display_name, "נטפליקס");
  });
});
